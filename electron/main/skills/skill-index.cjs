/**
 * Local Skill Index — durable catalog for Dashboard search / offline query.
 * Written after successful source sync; read on startup without waiting for network.
 */
const fs = require('fs')
const path = require('path')

function nowIso() {
  return new Date().toISOString()
}

function emptyIndex() {
  return {
    version: 1,
    updatedAt: null,
    skills: [],
  }
}

function toIndexEntry(skill = {}) {
  return {
    uid: skill.uid,
    skill_id: skill.manifest?.skill_id || skill.skillId || skill.uid,
    skillId: skill.skillId,
    name: skill.name || '',
    description: skill.description || '',
    tags: Array.isArray(skill.tags) ? skill.tags : [],
    version: skill.version || '0.0.0',
    latestVersion: skill.latestVersion || skill.version,
    sourceId: skill.sourceId,
    sourceName: skill.sourceName,
    namespace: skill.namespace,
    author: skill.author,
    category: skill.category,
    install_count: skill.installCount ?? 0,
    favorite_count: skill.favoriteCount ?? 0,
    downloads: skill.downloadCount ?? skill.downloads ?? 0,
    updatedAt: skill.updatedAt,
    homepageUrl: skill.homepageUrl,
    githubUrl: skill.githubUrl,
    packageSource: skill.packageSource,
    contentSource: skill.contentSource,
  }
}

function createSkillIndex({ dataRoot }) {
  const filePath = path.join(dataRoot, 'skill-index.json')
  let cache = null

  function load() {
    if (cache) return cache
    try {
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        cache = {
          ...emptyIndex(),
          ...raw,
          skills: Array.isArray(raw?.skills) ? raw.skills : [],
        }
      } else {
        cache = emptyIndex()
      }
    } catch {
      cache = emptyIndex()
    }
    return cache
  }

  function save(next) {
    cache = next
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8')
  }

  function getMeta() {
    const data = load()
    return {
      ok: true,
      exists: fs.existsSync(filePath) && (data.skills?.length || 0) > 0,
      count: data.skills?.length || 0,
      updatedAt: data.updatedAt,
      filePath,
    }
  }

  function readAll() {
    const data = load()
    return {
      ok: true,
      updatedAt: data.updatedAt,
      count: data.skills.length,
      skills: data.skills,
    }
  }

  function replaceAll(payload = {}) {
    const items = Array.isArray(payload.skills) ? payload.skills : []
    const skills = items
      .filter((s) => s && (s.uid || s.skillId || s.skill_id))
      .map((s) => toIndexEntry(s))
    const next = {
      version: 1,
      updatedAt: payload.updatedAt || nowIso(),
      skills,
    }
    save(next)
    return { ok: true, count: skills.length, updatedAt: next.updatedAt }
  }

  function search(payload = {}) {
    const q = String(payload.query || '')
      .trim()
      .toLowerCase()
    const limit = Math.min(Number(payload.limit) || 20, 50)
    const data = load()
    if (!q) {
      return { ok: true, skills: data.skills.slice(0, limit), total: data.skills.length }
    }
    const matched = data.skills.filter((s) => {
      const hay = [
        s.name,
        s.description,
        s.author,
        s.category,
        s.sourceName,
        s.skillId,
        s.skill_id,
        ...(s.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
    return { ok: true, skills: matched.slice(0, limit), total: matched.length }
  }

  return {
    getMeta,
    readAll,
    replaceAll,
    search,
    filePath,
  }
}

module.exports = { createSkillIndex, toIndexEntry }
