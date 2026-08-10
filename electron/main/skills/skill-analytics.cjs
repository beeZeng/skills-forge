/**
 * Local Skill analytics store (view / favorite / download / install / usage).
 * Schema mirrors planned remote tables; does not touch install/sync pipelines.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const FAST_GROWTH_THRESHOLD = 3

function nowIso() {
  return new Date().toISOString()
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}_${Date.now().toString(36)}`
}

function emptyDb() {
  return {
    version: 1,
    skills: {},
    favorites: [],
    installs: [],
    events: [],
    viewDedupe: {},
    downloadDedupe: {},
    pendingReports: [],
    localUserId: null,
  }
}

function createSkillAnalytics({ dataRoot }) {
  const filePath = path.join(dataRoot, 'skill-analytics.json')
  let db = null

  function load() {
    if (db) return db
    try {
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        db = { ...emptyDb(), ...raw }
      } else {
        db = emptyDb()
      }
    } catch {
      db = emptyDb()
    }
    if (!db.localUserId) {
      db.localUserId = `local_${crypto.randomBytes(8).toString('hex')}`
      save()
    }
    return db
  }

  function save() {
    const data = load()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
  }

  function resolveUserId(userId) {
    const data = load()
    return userId && String(userId).trim() ? String(userId).trim() : data.localUserId
  }

  function resolveSkillId(payload = {}) {
    const id =
      payload.skill_id ||
      payload.skillId ||
      payload.manifestSkillId ||
      payload.uid ||
      ''
    return String(id).trim()
  }

  function sanitizeInstallCount(row) {
    // Older builds seeded install_count from GitHub stars / repo popularity.
    // Installs must reflect real local install events only.
    const installs = Number(row.install_count) || 0
    const downloads = Number(row.download_count) || 0
    const recent = Array.isArray(row.recent_installs) ? row.recent_installs.length : 0
    if (installs >= 1000 && installs === downloads && recent === 0) {
      row.install_count = 0
    }
  }

  function ensureSkillRecord(skillId, meta = {}) {
    const data = load()
    if (!data.skills[skillId]) {
      const baseline = Number(meta.baselineDownloads) || 0
      data.skills[skillId] = {
        id: makeId('sk'),
        skill_id: skillId,
        name: meta.name || skillId,
        version: meta.version || '0.0.0',
        view_count: 0,
        favorite_count: 0,
        download_count: baseline,
        install_count: 0,
        usage_count: 0,
        recent_installs: [],
        created_time: nowIso(),
        updated_time: nowIso(),
      }
    } else {
      const row = data.skills[skillId]
      if (meta.name) row.name = meta.name
      if (meta.version) row.version = meta.version
      const baseline = Number(meta.baselineDownloads) || 0
      if (baseline > 0 && row.download_count < baseline) {
        // Catalog popularity floors downloads only — never inflate installs.
        row.download_count = baseline
      }
      sanitizeInstallCount(row)
      row.updated_time = nowIso()
    }
    return data.skills[skillId]
  }

  function appendEvent(userId, skillId, eventType, extra = {}) {
    const data = load()
    data.events.push({
      id: makeId('ev'),
      user_id: userId,
      skill_id: skillId,
      event_type: eventType,
      created_time: nowIso(),
      ...extra,
    })
    // Cap log size for desktop storage.
    if (data.events.length > 5000) data.events = data.events.slice(-4000)
  }

  function queuePending(report) {
    const data = load()
    data.pendingReports.push({
      id: makeId('pr'),
      ...report,
      created_time: nowIso(),
    })
    if (data.pendingReports.length > 1000) {
      data.pendingReports = data.pendingReports.slice(-800)
    }
  }

  function pruneRecentInstalls(row) {
    const cutoff = Date.now() - WEEK_MS
    row.recent_installs = (row.recent_installs || []).filter((t) => {
      const ms = typeof t === 'number' ? t : new Date(t).getTime()
      return Number.isFinite(ms) && ms >= cutoff
    })
    return row.recent_installs.length
  }

  function computeScore(row) {
    const recentGrowth = pruneRecentInstalls(row)
    return (
      (row.install_count || 0) * 0.5 +
      (row.favorite_count || 0) * 0.3 +
      recentGrowth * 0.2
    )
  }

  function computeBadges(row, meta = {}) {
    const badges = []
    const publishedAt = meta.updatedAt || meta.createdAt || row.created_time
    const publishedMs = publishedAt ? new Date(publishedAt).getTime() : 0
    if (publishedMs && Date.now() - publishedMs <= WEEK_MS) badges.push('new')
    const growth = pruneRecentInstalls(row)
    if (growth >= FAST_GROWTH_THRESHOLD) badges.push('fast_growth')
    const score = computeScore(row)
    if (score >= 50 || (row.install_count || 0) >= 100) badges.push('hot')
    if (meta.editorPick) badges.push('editor')
    return badges
  }

  function getStats(payload = {}) {
    const skillId = resolveSkillId(payload)
    if (!skillId) return { ok: false, error: 'skill_id required' }
    const row = ensureSkillRecord(skillId, payload)
    sanitizeInstallCount(row)
    save()
    return {
      ok: true,
      skill_id: skillId,
      views: row.view_count || 0,
      favorites: row.favorite_count || 0,
      downloads: row.download_count || 0,
      installs: row.install_count || 0,
      usage: row.usage_count || 0,
      score: computeScore(row),
      recentGrowth: pruneRecentInstalls(row),
      badges: computeBadges(row, payload),
    }
  }

  function getBulkStats(payload = {}) {
    const items = Array.isArray(payload.items) ? payload.items : []
    const userId = resolveUserId(payload.userId)
    const data = load()
    const favorited = new Set(
      data.favorites.filter((f) => f.user_id === userId).map((f) => f.skill_id),
    )
    const stats = {}
    for (const item of items) {
      const skillId = resolveSkillId(item)
      if (!skillId) continue
      const row = ensureSkillRecord(skillId, item)
      stats[skillId] = {
        views: row.view_count || 0,
        favorites: row.favorite_count || 0,
        downloads: row.download_count || 0,
        installs: row.install_count || 0,
        usage: row.usage_count || 0,
        score: computeScore(row),
        recentGrowth: pruneRecentInstalls(row),
        badges: computeBadges(row, item),
        favorited: favorited.has(skillId),
      }
    }
    save()
    return { ok: true, stats }
  }

  /** View: 24h dedupe per user+skill. Caller enforces ≥3s dwell. */
  function recordView(payload = {}) {
    const skillId = resolveSkillId(payload)
    if (!skillId) return { ok: false, error: 'skill_id required' }
    const userId = resolveUserId(payload.userId)
    const data = load()
    const key = `${userId}::${skillId}`
    const last = data.viewDedupe[key]
    const lastMs = last ? new Date(last).getTime() : 0
    if (lastMs && Date.now() - lastMs < DAY_MS) {
      return { ok: true, counted: false, reason: 'deduped', ...getStats({ ...payload, skill_id: skillId }) }
    }
    const row = ensureSkillRecord(skillId, payload)
    row.view_count = (row.view_count || 0) + 1
    row.updated_time = nowIso()
    data.viewDedupe[key] = nowIso()
    appendEvent(userId, skillId, 'view')
    queuePending({ type: 'view', skill_id: skillId, user_id: userId })
    save()
    return { ok: true, counted: true, ...getStats({ ...payload, skill_id: skillId }) }
  }

  function favorite(payload = {}) {
    const skillId = resolveSkillId(payload)
    if (!skillId) return { ok: false, error: 'skill_id required' }
    const userId = resolveUserId(payload.userId)
    const data = load()
    const exists = data.favorites.find((f) => f.user_id === userId && f.skill_id === skillId)
    if (exists) {
      return { ok: true, favorited: true, already: true, ...getStats({ ...payload, skill_id: skillId }) }
    }
    const row = ensureSkillRecord(skillId, payload)
    data.favorites.push({
      id: makeId('fav'),
      user_id: userId,
      skill_id: skillId,
      created_time: nowIso(),
    })
    row.favorite_count = (row.favorite_count || 0) + 1
    row.updated_time = nowIso()
    appendEvent(userId, skillId, 'favorite')
    queuePending({ type: 'favorite', skill_id: skillId, user_id: userId })
    save()
    return { ok: true, favorited: true, ...getStats({ ...payload, skill_id: skillId }) }
  }

  function unfavorite(payload = {}) {
    const skillId = resolveSkillId(payload)
    if (!skillId) return { ok: false, error: 'skill_id required' }
    const userId = resolveUserId(payload.userId)
    const data = load()
    const idx = data.favorites.findIndex((f) => f.user_id === userId && f.skill_id === skillId)
    if (idx < 0) {
      return { ok: true, favorited: false, already: true, ...getStats({ ...payload, skill_id: skillId }) }
    }
    data.favorites.splice(idx, 1)
    const row = ensureSkillRecord(skillId, payload)
    row.favorite_count = Math.max(0, (row.favorite_count || 0) - 1)
    row.updated_time = nowIso()
    appendEvent(userId, skillId, 'unfavorite')
    queuePending({ type: 'unfavorite', skill_id: skillId, user_id: userId })
    save()
    return { ok: true, favorited: false, ...getStats({ ...payload, skill_id: skillId }) }
  }

  /** Download: same user+skill+version within 24h counts once. */
  function recordDownload(payload = {}) {
    const skillId = resolveSkillId(payload)
    if (!skillId) return { ok: false, error: 'skill_id required' }
    const userId = resolveUserId(payload.userId)
    const version = String(payload.version || 'unknown')
    const data = load()
    const key = `${userId}::${skillId}::${version}`
    const last = data.downloadDedupe[key]
    const lastMs = last ? new Date(last).getTime() : 0
    if (lastMs && Date.now() - lastMs < DAY_MS) {
      return { ok: true, counted: false, reason: 'deduped', ...getStats({ ...payload, skill_id: skillId }) }
    }
    const row = ensureSkillRecord(skillId, payload)
    row.download_count = (row.download_count || 0) + 1
    row.updated_time = nowIso()
    data.downloadDedupe[key] = nowIso()
    appendEvent(userId, skillId, 'download', { version })
    queuePending({ type: 'download', skill_id: skillId, user_id: userId, version })
    save()
    return { ok: true, counted: true, ...getStats({ ...payload, skill_id: skillId }) }
  }

  /** Install success only — caller must invoke after registry success. */
  function recordInstall(payload = {}) {
    const skillId = resolveSkillId(payload)
    if (!skillId) return { ok: false, error: 'skill_id required' }
    const userId = resolveUserId(payload.userId)
    const version = String(payload.version || 'unknown')
    const agentType = payload.agent_type || payload.agentType || 'Nexus Agent'
    const data = load()
    const row = ensureSkillRecord(skillId, payload)
    row.install_count = (row.install_count || 0) + 1
    row.recent_installs = row.recent_installs || []
    row.recent_installs.push(Date.now())
    pruneRecentInstalls(row)
    row.updated_time = nowIso()
    data.installs.push({
      id: makeId('ins'),
      user_id: userId,
      skill_id: skillId,
      version,
      install_time: nowIso(),
      agent_type: agentType,
    })
    if (data.installs.length > 2000) data.installs = data.installs.slice(-1500)
    appendEvent(userId, skillId, 'install', { version, agent_type: agentType })
    queuePending({
      type: 'install',
      skill_id: skillId,
      user_id: userId,
      version,
      agent_type: agentType,
      offline: Boolean(payload.offline),
    })
    save()
    return { ok: true, counted: true, ...getStats({ ...payload, skill_id: skillId }) }
  }

  /** Phase-1 reserved: usage field + event only. */
  function recordUsage(payload = {}) {
    const skillId = resolveSkillId(payload)
    if (!skillId) return { ok: false, error: 'skill_id required' }
    const userId = resolveUserId(payload.userId)
    const row = ensureSkillRecord(skillId, payload)
    row.usage_count = (row.usage_count || 0) + 1
    row.updated_time = nowIso()
    appendEvent(userId, skillId, 'usage', { agent_type: payload.agent_type || payload.agentType })
    queuePending({ type: 'usage', skill_id: skillId, user_id: userId })
    save()
    return { ok: true, counted: true, ...getStats({ ...payload, skill_id: skillId }) }
  }

  function listPending() {
    return { ok: true, pending: load().pendingReports.slice() }
  }

  function clearPending(payload = {}) {
    const data = load()
    const ids = new Set(Array.isArray(payload.ids) ? payload.ids : [])
    if (ids.size === 0) data.pendingReports = []
    else data.pendingReports = data.pendingReports.filter((p) => !ids.has(p.id))
    save()
    return { ok: true, remaining: data.pendingReports.length }
  }

  return {
    getStats,
    getBulkStats,
    recordView,
    favorite,
    unfavorite,
    recordDownload,
    recordInstall,
    recordUsage,
    listPending,
    clearPending,
    filePath,
  }
}

module.exports = { createSkillAnalytics }
