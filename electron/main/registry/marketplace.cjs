/**
 * Public marketplace / skill-index clients:
 * - SkillsMP  https://skillsmp.com
 * - Pale Blue Dot SkillHub  https://skills.palebluedot.live
 */

function normalizeBaseUrl(input) {
  if (!input || typeof input !== 'string') return ''
  let url = input.trim()
  try {
    const parsed = new URL(url)
    url = `${parsed.protocol}//${parsed.host}`
  } catch {
    // keep raw
  }
  return url.replace(/\/+$/, '')
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

function kindOf({ type, registryUrl } = {}) {
  if (type === 'skillsmp') return 'skillsmp'
  if (type === 'palebluedot') return 'palebluedot'
  const host = String(registryUrl || '').toLowerCase()
  if (/skillsmp\.com/i.test(host)) return 'skillsmp'
  if (/palebluedot\.live/i.test(host)) return 'palebluedot'
  return null
}

function isMarketplaceSource(payload = {}) {
  return Boolean(kindOf(payload))
}

function formatDay(value) {
  if (value == null) return undefined
  try {
    if (typeof value === 'number') {
      const ms = value < 1e12 ? value * 1000 : value
      return new Date(ms).toISOString().slice(0, 10)
    }
    return new Date(value).toISOString().slice(0, 10)
  } catch {
    return undefined
  }
}

function mapSkillsMpItem(item, { sourceId, sourceName }) {
  const name = item.name || item.slug
  if (!name) return null
  const author = item.author || item.route?.ownerSlug || 'community'
  const skillId = item.id || `${author}/${name}`
  return {
    uid: `${sourceId}:${skillId}`,
    sourceId,
    sourceName,
    namespace: author,
    skillId,
    name,
    description: item.description || '',
    version: item.version || 'latest',
    latestVersion: item.version || 'latest',
    author,
    tags: item.contentLanguage ? [item.contentLanguage] : [],
    category: '未分类',
    updatedAt: formatDay(item.updatedAt),
    installed: false,
    updateAvailable: false,
    favorite: false,
    downloads: item.stars,
    syncedAgents: [],
    origin: 'catalog',
  }
}

function mapPaleBlueDotItem(item, { sourceId, sourceName }) {
  const name = item.name
  if (!name) return null
  const owner = item.githubOwner || 'community'
  const skillId = item.id || `${owner}/${item.githubRepo || 'repo'}/${name}`
  const tags = Array.isArray(item.compatibility?.platforms) ? item.compatibility.platforms : []
  return {
    uid: `${sourceId}:${skillId}`,
    sourceId,
    sourceName,
    namespace: owner,
    skillId,
    name,
    description: item.description || '',
    version: item.version || 'latest',
    latestVersion: item.version || 'latest',
    author: owner,
    tags,
    category: tags[0] || '未分类',
    license: item.license || undefined,
    updatedAt: formatDay(item.updatedAt),
    installed: false,
    updateAvailable: false,
    favorite: false,
    downloads: item.downloadCount ?? item.githubStars,
    syncedAgents: [],
    origin: 'catalog',
  }
}

async function testConnection(payload = {}) {
  const kind = kindOf(payload)
  const base = normalizeBaseUrl(payload.registryUrl)
  if (!kind || !base) {
    return { ok: false, status: 'disconnected', message: '未知的市场源', baseUrl: base || '' }
  }
  try {
    const url =
      kind === 'skillsmp'
        ? `${base}/api/skills?limit=1&sortBy=stars`
        : `${base}/api/skills?limit=1`
    const { res, body } = await fetchJson(url, { token: payload.token, timeoutMs: 8000 })
    if (res.ok && Array.isArray(body?.skills)) {
      const label = kind === 'skillsmp' ? 'SkillsMP' : 'Pale Blue Dot'
      return { ok: true, status: 'connected', message: `${label} API 可达 (${res.status})`, baseUrl: base }
    }
    return {
      ok: false,
      status: 'disconnected',
      message: `连接失败 HTTP ${res.status}`,
      baseUrl: base,
    }
  } catch (error) {
    return {
      ok: false,
      status: 'disconnected',
      message: error instanceof Error ? error.message : '连接失败',
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
  type,
} = {}) {
  const kind = kindOf({ type, registryUrl })
  const base = normalizeBaseUrl(registryUrl)
  if (!kind || !base) {
    return { ok: false, skills: [], message: '未知的市场源', baseUrl: base || '' }
  }

  const meta = {
    sourceId: sourceId || kind,
    sourceName: sourceName || (kind === 'skillsmp' ? 'SkillsMP' : 'Pale Blue Dot'),
  }
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const q = (query || '').trim()

  try {
    let items = []
    if (kind === 'skillsmp') {
      if (q) {
        const url = `${base}/api/v1/skills/search?q=${encodeURIComponent(q)}&limit=${capped}&sortBy=stars`
        const { res, body } = await fetchJson(url, { token, timeoutMs: 15000 })
        if (!res.ok) {
          return { ok: false, skills: [], message: `SkillsMP 搜索失败 HTTP ${res.status}`, baseUrl: base }
        }
        items = body?.data?.skills || body?.skills || []
      } else {
        const url = `${base}/api/skills?limit=${capped}&page=1&sortBy=stars`
        const { res, body } = await fetchJson(url, { token, timeoutMs: 15000 })
        if (!res.ok) {
          return { ok: false, skills: [], message: `SkillsMP 目录失败 HTTP ${res.status}`, baseUrl: base }
        }
        items = body?.skills || []
      }
      const skills = items.map((item) => mapSkillsMpItem(item, meta)).filter(Boolean)
      return { ok: true, skills, message: `已拉取 ${skills.length} 个 SkillsMP Skill`, baseUrl: base }
    }

    // palebluedot — supports page/limit/q/sort (not offset)
    const qs = new URLSearchParams({ limit: String(capped), page: '1', sort: 'stars' })
    if (q) qs.set('q', q)
    const { res, body } = await fetchJson(`${base}/api/skills?${qs}`, { token, timeoutMs: 15000 })
    if (!res.ok) {
      return { ok: false, skills: [], message: `Pale Blue Dot 拉取失败 HTTP ${res.status}`, baseUrl: base }
    }
    items = body?.skills || []
    const skills = items.map((item) => mapPaleBlueDotItem(item, meta)).filter(Boolean)
    return { ok: true, skills, message: `已拉取 ${skills.length} 个 Pale Blue Dot Skill`, baseUrl: base }
  } catch (error) {
    return {
      ok: false,
      skills: [],
      message: error instanceof Error ? error.message : '市场源列表拉取失败',
      baseUrl: base,
    }
  }
}

module.exports = {
  normalizeBaseUrl,
  kindOf,
  isMarketplaceSource,
  testConnection,
  listSkills,
}
