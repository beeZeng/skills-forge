/**
 * ClawHub public registry client
 * Docs: https://docs.openclaw.ai/clawhub/http-api
 * Base: https://clawhub.ai
 */

function normalizeBaseUrl(input) {
  if (!input || typeof input !== 'string') return ''
  let url = input.trim()
  try {
    const parsed = new URL(url)
    url = `${parsed.protocol}//${parsed.host}${parsed.pathname || ''}`
  } catch {
    // keep raw
  }
  return url
    .replace(/\/+$/, '')
    .replace(/\/api\/v1\/skills\/?$/i, '')
    .replace(/\/api\/v1\/?$/i, '')
    .replace(/\/registry\/?$/i, '')
    .replace(/\/+$/, '')
}

function authHeaders(token) {
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function fetchJson(url, { token, timeoutMs = 12000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: authHeaders(token),
      signal: controller.signal,
    })
    const text = await res.text()
    let body = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }
    return { res, body }
  } finally {
    clearTimeout(timer)
  }
}

function formatDay(ms) {
  if (!ms || typeof ms !== 'number') return undefined
  try {
    return new Date(ms).toISOString().slice(0, 10)
  } catch {
    return undefined
  }
}

function mapSkill(item, { sourceId, sourceName }) {
  const slug = item.slug || item.displayName
  if (!slug) return null
  const owner =
    item.owner?.handle ||
    item.native?.ownerHandle ||
    item.install?.reference?.split?.('/')?.[0] ||
    'community'
  const version =
    item.latestVersion?.version ||
    (typeof item.latestVersion === 'string' ? item.latestVersion : undefined) ||
    item.tags?.latest ||
    item.version ||
    '0.0.0'
  const tags = Array.isArray(item.topics)
    ? item.topics
    : item.topics
      ? Object.keys(item.topics)
      : Array.isArray(item.tags)
        ? item.tags
        : []
  return {
    uid: `${sourceId}:${owner}/${slug}`,
    sourceId,
    sourceName,
    namespace: owner,
    skillId: slug,
    name: item.displayName || slug,
    description: item.summary || item.description || '',
    version,
    latestVersion: version,
    author: item.owner?.displayName || owner,
    tags,
    category: item.native?.skill?.categories?.[0] || tags[0] || '未分类',
    license: item.latestVersion?.license || undefined,
    updatedAt: formatDay(item.updatedAt || item.metrics?.updatedAt),
    installed: false,
    updateAvailable: false,
    favorite: false,
    downloads: item.stats?.downloads ?? item.downloads,
    syncedAgents: [],
    origin: 'catalog',
  }
}

async function testConnection({ registryUrl, token } = {}) {
  const base = normalizeBaseUrl(registryUrl) || 'https://clawhub.ai'
  try {
    const { res, body } = await fetchJson(`${base}/api/v1/skills?limit=1&sort=updated`, {
      token,
      timeoutMs: 8000,
    })
    if (res.ok && (Array.isArray(body?.items) || Array.isArray(body?.results))) {
      return { ok: true, status: 'connected', message: `ClawHub API 可达 (${res.status})`, baseUrl: base }
    }
    return {
      ok: false,
      status: 'disconnected',
      message: `ClawHub 连接失败 HTTP ${res.status}`,
      baseUrl: base,
    }
  } catch (error) {
    return {
      ok: false,
      status: 'disconnected',
      message: error instanceof Error ? error.message : 'ClawHub 连接失败',
      baseUrl: base,
    }
  }
}

async function listSkills({
  registryUrl,
  token,
  sourceId,
  sourceName,
  query = '',
  limit = 50,
} = {}) {
  const base = normalizeBaseUrl(registryUrl) || 'https://clawhub.ai'
  const meta = {
    sourceId: sourceId || 'clawhub',
    sourceName: sourceName || 'ClawHub',
  }
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 100)

  try {
    let items = []
    const q = (query || '').trim()
    if (q) {
      const { res, body } = await fetchJson(
        `${base}/api/v1/search?q=${encodeURIComponent(q)}&limit=${capped}`,
        { token, timeoutMs: 15000 },
      )
      if (!res.ok) {
        return { ok: false, skills: [], message: `ClawHub 搜索失败 HTTP ${res.status}`, baseUrl: base }
      }
      items = body?.results || body?.items || (Array.isArray(body) ? body : [])
      // search results nest skill under native.skill sometimes
      items = items.map((row) => {
        if (row.slug || row.displayName) return row
        const skill = row.native?.skill
        if (skill) {
          return {
            ...skill,
            summary: skill.summary || row.summary,
            install: row.install,
            native: row.native,
            stats: skill.stats || row.stats,
          }
        }
        return row
      })
    } else {
      items = []
      let cursor = ''
      const pageSize = Math.min(capped, 50)
      for (let page = 0; page < 5 && items.length < capped; page++) {
        const qs = new URLSearchParams({
          limit: String(pageSize),
          sort: 'updated',
        })
        if (cursor) qs.set('cursor', cursor)
        const { res, body } = await fetchJson(`${base}/api/v1/skills?${qs}`, {
          token,
          timeoutMs: 15000,
        })
        if (!res.ok) {
          if (items.length) break
          return { ok: false, skills: [], message: `ClawHub 目录失败 HTTP ${res.status}`, baseUrl: base }
        }
        const batch = body?.items || []
        items.push(...batch)
        cursor = typeof body?.nextCursor === 'string' ? body.nextCursor : ''
        if (!cursor || !batch.length) break
      }
      items = items.slice(0, capped)
    }

    const skills = (Array.isArray(items) ? items : []).map((item) => mapSkill(item, meta)).filter(Boolean)
    return {
      ok: true,
      skills,
      message: `已拉取 ${skills.length} 个 ClawHub Skill`,
      baseUrl: base,
    }
  } catch (error) {
    return {
      ok: false,
      skills: [],
      message: error instanceof Error ? error.message : 'ClawHub 列表拉取失败',
      baseUrl: base,
    }
  }
}

function isClawHubSource({ type, registryUrl } = {}) {
  if (type === 'clawhub') return true
  const url = String(registryUrl || '')
  return /clawhub\.(ai|com)/i.test(url)
}

module.exports = {
  normalizeBaseUrl,
  testConnection,
  listSkills,
  isClawHubSource,
}
