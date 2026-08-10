/**
 * SkillHub registry client (portal + CLI APIs).
 * registryUrl may be a base like http://localhost:8080 or include /actuator/health.
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
    .replace(/\/actuator\/health$/i, '')
    .replace(/\/api\/cli\/v1\/skills\/search$/i, '')
    .replace(/\/api\/v1\/skills$/i, '')
    .replace(/\/registry$/i, '')
    .replace(/\/+$/, '')
}

function authHeaders(token) {
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function fetchJson(url, { token, timeoutMs = 8000 } = {}) {
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
    return { res, body, text }
  } finally {
    clearTimeout(timer)
  }
}

async function testConnection({ registryUrl, token } = {}) {
  const base = normalizeBaseUrl(registryUrl)
  if (!base) {
    return { ok: false, status: 'disconnected', message: '缺少 Registry URL', baseUrl: '' }
  }

  const healthUrl = `${base}/actuator/health`
  try {
    const { res, body } = await fetchJson(healthUrl, { token, timeoutMs: 4000 })
    if (res.ok && (!body || body.status === 'UP' || body.status === undefined)) {
      return { ok: true, status: 'connected', message: `健康检查通过 (${res.status})`, baseUrl: base }
    }
  } catch {
    // fall through
  }

  // Fallback: CLI search proves API is reachable
  try {
    const searchUrl = `${base}/api/cli/v1/skills/search?q=&limit=1`
    const { res, body } = await fetchJson(searchUrl, { token, timeoutMs: 4000 })
    if (res.ok && (body?.code === 0 || Array.isArray(body?.data?.items) || Array.isArray(body?.items))) {
      return { ok: true, status: 'connected', message: `API 可达 (${res.status})`, baseUrl: base }
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

function mapCliItem(item, { sourceId, sourceName, baseUrl }) {
  const namespace = item.namespace || 'global'
  const slug = item.slug || item.skillId || item.name
  if (!slug) return null
  const version = item.latestVersion || item.version || '0.0.0'
  let updatedAt
  if (item.updatedAt) {
    const ms = new Date(item.updatedAt).getTime()
    updatedAt = Number.isNaN(ms) ? String(item.updatedAt) : new Date(ms).toISOString()
  }
  const base = String(baseUrl || '').replace(/\/+$/, '')
  const homepageUrl = base
    ? `${base}/skills/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}`
    : undefined
  return {
    uid: `${sourceId}:${namespace}/${slug}`,
    sourceId,
    sourceName,
    namespace,
    skillId: slug,
    name: item.displayName || item.name || slug,
    description: item.summary || item.description || '',
    version,
    latestVersion: version,
    author: item.ownerDisplayName || item.ownerId,
    tags: Array.isArray(item.tags) ? item.tags : item.tags ? Object.keys(item.tags) : [],
    category: item.category || (Array.isArray(item.labels) && item.labels[0]) || '未分类',
    sizeLabel: undefined,
    license: item.license,
    updatedAt,
    homepageUrl,
    packageSource: base
      ? {
          kind: 'skillhub',
          baseUrl: base,
          namespace,
          slug,
          version,
        }
      : undefined,
    installed: false,
    updateAvailable: false,
    favorite: false,
    downloads: item.stats?.downloads ?? item.downloadCount,
    syncedAgents: [],
    origin: 'catalog',
  }
}

function mapPortalItem(item, { sourceId, sourceName, baseUrl }) {
  const rawSlug = item.slug || ''
  let namespace = item.namespace
  let slug = item.displayName || item.slug
  // Portal catalog may return canonical "ns--slug" or bare slug (implies global)
  if (!namespace && typeof rawSlug === 'string' && rawSlug.includes('--')) {
    const idx = rawSlug.indexOf('--')
    namespace = rawSlug.slice(0, idx)
    slug = rawSlug.slice(idx + 2) || item.displayName || rawSlug
  } else if (!namespace && item.displayName && rawSlug === item.displayName) {
    namespace = 'global'
    slug = item.displayName
  }
  namespace = namespace || 'global'
  slug = slug || rawSlug
  if (!slug) return null
  const version = item.latestVersion?.version || item.latestVersion || '0.0.0'
  return mapCliItem(
    {
      namespace,
      slug,
      displayName: item.displayName || slug,
      summary: item.summary,
      latestVersion: version,
      updatedAt: item.updatedAt,
      stats: item.stats,
      tags: item.tags,
    },
    { sourceId, sourceName, baseUrl },
  )
}

async function listSkillsByNamespaces({ base, meta, namespaces, limit = 100 }) {
  const auth = require('./skillhub-auth.cjs')
  const slugs = (namespaces || []).map((n) => (typeof n === 'string' ? n : n?.slug)).filter(Boolean)
  if (!slugs.length) {
    return { ok: true, skills: [], message: '当前账号无可用命名空间', baseUrl: base }
  }

  const byUid = new Map()
  const errors = []
  for (const slug of slugs) {
    try {
      let page = 0
      const size = Math.min(limit, 50)
      let fetched = 0
      while (fetched < limit) {
        const url = `${base}/api/web/skills?namespace=${encodeURIComponent(slug)}&page=${page}&size=${size}`
        const { res, body } = await auth.sessionGetJson(url, { timeoutMs: 12000 })
        if (!res.ok) {
          errors.push(`${slug}: HTTP ${res.status}`)
          break
        }
        const data = body?.data ?? body
        const items = data?.items || data?.content || (Array.isArray(data) ? data : [])
        if (!Array.isArray(items) || !items.length) break
        for (const item of items) {
          const mapped = mapPortalItem(
            { ...item, namespace: item.namespace || slug },
            meta,
          )
          if (mapped) byUid.set(mapped.uid, mapped)
        }
        fetched += items.length
        const totalPages = data?.totalPages
        if (typeof totalPages === 'number' && page + 1 >= totalPages) break
        if (items.length < size) break
        page += 1
      }
    } catch (error) {
      errors.push(`${slug}: ${error instanceof Error ? error.message : '失败'}`)
    }
  }

  const skills = Array.from(byUid.values())
  if (!skills.length && errors.length) {
    return { ok: false, skills: [], message: errors.join('；'), baseUrl: base }
  }
  return {
    ok: true,
    skills,
    message: `已拉取 ${skills.length} 个 Skill（${slugs.length} 个命名空间）${errors.length ? `；部分失败：${errors.join('；')}` : ''}`,
    baseUrl: base,
  }
}

async function listSkills({
  registryUrl,
  token,
  sourceId,
  sourceName,
  query = '',
  limit = 100,
  useSession = false,
  namespaces,
} = {}) {
  const base = normalizeBaseUrl(registryUrl)
  if (!base) {
    return { ok: false, skills: [], message: '缺少 Registry URL', baseUrl: '' }
  }

  const meta = { sourceId: sourceId || 'unknown', sourceName: sourceName || 'SkillHub', baseUrl: base }

  // Account-bound Pangu Hub: aggregate skills across the user's namespaces via session
  if (useSession && Array.isArray(namespaces) && namespaces.length) {
    return listSkillsByNamespaces({ base, meta, namespaces, limit })
  }

  // Prefer CLI search (stable namespace/slug) — anonymous/public when no session
  try {
    const q = encodeURIComponent(query || '')
    const url = `${base}/api/cli/v1/skills/search?q=${q}&limit=${limit}`
    const { res, body } = await fetchJson(url, { token, timeoutMs: 10000 })
    if (res.ok) {
      const items = body?.data?.items || body?.items || []
      if (Array.isArray(items)) {
        const skills = items.map((item) => mapCliItem(item, meta)).filter(Boolean)
        return { ok: true, skills, message: `已拉取 ${skills.length} 个 Skill`, baseUrl: base }
      }
    }
  } catch {
    // fall through
  }

  // Fallback portal list
  try {
    const url = `${base}/api/v1/skills?limit=${limit}`
    const { res, body } = await fetchJson(url, { token, timeoutMs: 10000 })
    if (!res.ok) {
      return { ok: false, skills: [], message: `列表拉取失败 HTTP ${res.status}`, baseUrl: base }
    }
    const items = body?.items || body?.data?.items || []
    const skills = (Array.isArray(items) ? items : []).map((item) => mapPortalItem(item, meta)).filter(Boolean)
    return { ok: true, skills, message: `已拉取 ${skills.length} 个 Skill`, baseUrl: base }
  } catch (error) {
    return {
      ok: false,
      skills: [],
      message: error instanceof Error ? error.message : '列表拉取失败',
      baseUrl: base,
    }
  }
}

module.exports = {
  normalizeBaseUrl,
  testConnection,
  listSkills,
}
