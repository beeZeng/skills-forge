import type { Skill, SkillSource, SourceNamespace } from '@/types'

type ListPayload = {
  registryUrl?: string
  token?: string
  sourceId: string
  sourceName: string
  type?: SkillSource['type']
  query?: string
  limit?: number
  useSession?: boolean
  namespaces?: Array<string | SourceNamespace>
}

type ListResult = {
  ok: boolean
  skills: Skill[]
  message?: string
  baseUrl?: string
}

type TestResult = {
  ok: boolean
  status: 'connected' | 'disconnected' | 'checking'
  message?: string
  baseUrl?: string
}

function normalizeBaseUrl(input?: string) {
  if (!input) return ''
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
    .replace(/\/api\/v1\/skills\/?$/i, '')
    .replace(/\/api\/v1\/?$/i, '')
    .replace(/\/registry\/?$/i, '')
    .replace(/\/+$/, '')
}

function isClawHub(payload: { type?: string; registryUrl?: string }) {
  if (payload.type === 'clawhub') return true
  return /clawhub\.(ai|com)/i.test(payload.registryUrl || '')
}

function marketplaceKind(payload: { type?: string; registryUrl?: string }) {
  if (payload.type === 'skillsmp') return 'skillsmp' as const
  if (payload.type === 'palebluedot') return 'palebluedot' as const
  const url = payload.registryUrl || ''
  if (/skillsmp\.com/i.test(url)) return 'skillsmp' as const
  if (/palebluedot\.live/i.test(url)) return 'palebluedot' as const
  return null
}

/** Dev browser proxies avoid CORS when Electron IPC is unavailable. */
function resolveFetchBase(registryUrl?: string, type?: SkillSource['type']) {
  const base = normalizeBaseUrl(registryUrl)
  if (!base) return ''
  if (typeof window !== 'undefined' && !window.skillMesh?.sources?.listSkills && import.meta.env.DEV) {
    if (isClawHub({ type, registryUrl: base })) return '/__clawhub'
    const market = marketplaceKind({ type, registryUrl: base })
    if (market === 'skillsmp') return '/__skillsmp'
    if (market === 'palebluedot') return '/__palebluedot'
    try {
      const u = new URL(base)
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return '/__skillhub'
      if (u.hostname === 'skill.xfyun.cn') return '/__xfyun'
    } catch {
      // fall through
    }
  }
  return base
}

function authHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function formatDay(ms?: number) {
  if (!ms || typeof ms !== 'number') return undefined
  try {
    return new Date(ms).toISOString().slice(0, 10)
  } catch {
    return undefined
  }
}

function mapSkillHubItem(
  item: {
    namespace?: string
    slug?: string
    displayName?: string
    name?: string
    summary?: string
    description?: string
    latestVersion?: string
    version?: string
  },
  meta: { sourceId: string; sourceName: string; baseUrl?: string },
): Skill | null {
  const namespace = item.namespace || 'global'
  const slug = item.slug || item.name
  if (!slug) return null
  const version = item.latestVersion || item.version || '0.0.0'
  const base = String(meta.baseUrl || '').replace(/\/+$/, '')
  return {
    uid: `${meta.sourceId}:${namespace}/${slug}`,
    sourceId: meta.sourceId,
    sourceName: meta.sourceName,
    namespace,
    skillId: slug,
    name: item.displayName || item.name || slug,
    description: item.summary || item.description || '',
    version,
    latestVersion: version,
    tags: [],
    category: '未分类',
    homepageUrl: base
      ? `${base}/skills/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}`
      : undefined,
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
    syncedAgents: [],
    origin: 'catalog',
  }
}

function formatMarketDay(value?: number | string) {
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

/** Prefer github.com URLs; never treat marketplace listing pages as GitHub. */
function pickGithubUrl(...candidates: unknown[]): string | undefined {
  for (const raw of candidates) {
    if (!raw) continue
    const url = String(raw).trim()
    if (/^https?:\/\/github\.com\//i.test(url)) return url
  }
  return undefined
}

function parseGithubRepoUrl(url?: string) {
  if (!url) return null
  const m = String(url).trim().match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)(?:\/(.*))?)?\/?$/i,
  )
  if (!m) return null
  return {
    owner: m[1],
    repo: m[2],
    branch: m[3] || undefined,
    path: (m[4] || '').replace(/\/+$/, ''),
  }
}

function mapSkillsMpItem(item: Record<string, any>, meta: { sourceId: string; sourceName: string }): Skill | null {
  const name = item.name || item.slug
  if (!name) return null
  const author = item.author || item.route?.ownerSlug || 'community'
  const skillId = item.id || `${author}/${name}`
  const githubUrl = pickGithubUrl(item.githubUrl, item.htmlUrl, item.url, item.homepage)
  // Prefer route.sourceSkillPath; item.path is often just "SKILL.md"
  const sourceSkillPath = item.route?.sourceSkillPath || ''
  const branch = item.branch || item.route?.branch || 'main'
  const parsed = parseGithubRepoUrl(githubUrl)
  const homepageUrl =
    item.skillUrl ||
    (item.route?.ownerSlug && item.route?.skillSlug
      ? `https://skillsmp.com/${encodeURIComponent(item.route.ownerSlug)}/${encodeURIComponent(item.route.skillSlug)}`
      : `https://skillsmp.com/skills/${encodeURIComponent(String(skillId))}`)
  const dirPath = sourceSkillPath
    ? String(sourceSkillPath).replace(/\\/g, '/').replace(/\/?SKILL\.md$/i, '')
    : parsed?.path
      ? String(parsed.path).replace(/\\/g, '/').replace(/\/?SKILL\.md$/i, '')
      : ''
  const owner = parsed?.owner || item.route?.ownerSlug || author
  const repo = parsed?.repo || item.route?.repoSlug
  return {
    uid: `${meta.sourceId}:${skillId}`,
    sourceId: meta.sourceId,
    sourceName: meta.sourceName,
    namespace: author,
    skillId,
    name,
    description: item.description || '',
    version: item.version || 'latest',
    latestVersion: item.version || 'latest',
    author,
    tags: item.contentLanguage ? [item.contentLanguage] : [],
    category: '未分类',
    updatedAt: formatMarketDay(item.updatedAt),
    homepageUrl,
    githubUrl: githubUrl || undefined,
    packageSource: githubUrl && owner && repo
      ? {
          kind: 'github',
          githubUrl,
          owner,
          repo,
          branch: parsed?.branch || branch,
          path: dirPath || undefined,
          sourceSkillPath: sourceSkillPath || (dirPath ? `${dirPath}/SKILL.md` : undefined),
        }
      : undefined,
    installed: false,
    updateAvailable: false,
    favorite: false,
    downloads: item.stars,
    syncedAgents: [],
    origin: 'catalog',
  }
}

function mapPaleBlueDotItem(item: Record<string, any>, meta: { sourceId: string; sourceName: string }): Skill | null {
  const name = item.name
  if (!name) return null
  const owner = item.githubOwner || 'community'
  const repo = item.githubRepo || 'repo'
  const skillId = item.id || `${owner}/${repo}/${name}`
  const tags = Array.isArray(item.compatibility?.platforms) ? item.compatibility.platforms : []
  const githubUrl =
    pickGithubUrl(item.githubUrl, item.htmlUrl, item.url) ||
    (item.githubOwner && item.githubRepo
      ? `https://github.com/${item.githubOwner}/${item.githubRepo}`
      : undefined)
  const homepageUrl = githubUrl || 'https://skills.palebluedot.live'
  const skillPath = item.path || item.skillPath || item.sourceSkillPath || ''
  return {
    uid: `${meta.sourceId}:${skillId}`,
    sourceId: meta.sourceId,
    sourceName: meta.sourceName,
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
    updatedAt: formatMarketDay(item.updatedAt),
    homepageUrl,
    githubUrl,
    packageSource:
      item.githubOwner && item.githubRepo
        ? {
            kind: 'github',
            githubUrl,
            owner: item.githubOwner,
            repo: item.githubRepo,
            branch: item.branch || item.defaultBranch || 'main',
            path: skillPath ? String(skillPath).replace(/\/?SKILL\.md$/i, '') : undefined,
            sourceSkillPath: skillPath || undefined,
          }
        : undefined,
    installed: false,
    updateAvailable: false,
    favorite: false,
    downloads: item.downloadCount ?? item.githubStars,
    syncedAgents: [],
    origin: 'catalog',
  }
}

function mapClawHubItem(item: Record<string, any>, meta: { sourceId: string; sourceName: string }): Skill | null {
  const nested = item.native?.skill
  const slug = item.slug || nested?.slug || item.displayName
  if (!slug) return null
  const owner =
    item.owner?.handle || item.native?.ownerHandle || item.install?.reference?.split?.('/')?.[0] || 'community'
  const version =
    item.latestVersion?.version ||
    (typeof item.latestVersion === 'string' ? item.latestVersion : undefined) ||
    item.tags?.latest ||
    nested?.tags?.latest ||
    '0.0.0'
  const tags = Array.isArray(item.topics) ? item.topics : Array.isArray(nested?.topics) ? nested.topics : []
  return {
    uid: `${meta.sourceId}:${owner}/${slug}`,
    sourceId: meta.sourceId,
    sourceName: meta.sourceName,
    namespace: owner,
    skillId: slug,
    name: item.displayName || nested?.displayName || slug,
    description: item.summary || nested?.summary || item.description || '',
    version,
    latestVersion: version,
    author: item.owner?.displayName || owner,
    tags,
    category: nested?.categories?.[0] || tags[0] || '未分类',
    updatedAt: formatDay(item.updatedAt || nested?.updatedAt),
    homepageUrl: `https://clawhub.ai/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}`,
    packageSource: {
      kind: 'clawhub',
      clawhubSlug: slug,
    },
    installed: false,
    updateAvailable: false,
    favorite: false,
    downloads: item.stats?.downloads ?? nested?.stats?.downloads,
    syncedAgents: [],
    origin: 'catalog',
  }
}

async function browserListByNamespaces(
  fetchBase: string,
  logicalBase: string,
  meta: { sourceId: string; sourceName: string; baseUrl?: string },
  namespaces: Array<string | SourceNamespace>,
  limit: number,
): Promise<ListResult> {
  const slugs = namespaces.map((n) => (typeof n === 'string' ? n : n.slug)).filter(Boolean)
  if (!slugs.length) {
    return { ok: true, skills: [], message: '当前账号无可用命名空间', baseUrl: logicalBase }
  }
  const byUid = new Map<string, Skill>()
  const errors: string[] = []
  for (const slug of slugs) {
    try {
      let page = 0
      const size = Math.min(limit, 50)
      let fetched = 0
      while (fetched < limit) {
        const url = `${fetchBase}/api/web/skills?namespace=${encodeURIComponent(slug)}&page=${page}&size=${size}`
        const res = await fetch(url, {
          credentials: 'include',
          headers: authHeaders(),
        })
        const body = await res.json().catch(() => null)
        if (!res.ok) {
          errors.push(`${slug}: HTTP ${res.status}`)
          break
        }
        const data = body?.data ?? body
        const items = data?.items || data?.content || (Array.isArray(data) ? data : [])
        if (!Array.isArray(items) || !items.length) break
        for (const item of items) {
          const mapped = mapSkillHubItem(
            { ...item, namespace: item.namespace || slug },
            meta,
          )
          if (mapped) byUid.set(mapped.uid, mapped)
        }
        fetched += items.length
        if (typeof data?.totalPages === 'number' && page + 1 >= data.totalPages) break
        if (items.length < size) break
        page += 1
      }
    } catch (error) {
      errors.push(`${slug}: ${error instanceof Error ? error.message : '失败'}`)
    }
  }
  const skills = Array.from(byUid.values())
  if (!skills.length && errors.length) {
    return { ok: false, skills: [], message: errors.join('；'), baseUrl: logicalBase }
  }
  return {
    ok: true,
    skills,
    message: `已拉取 ${skills.length} 个 Skill（${slugs.length} 个命名空间）`,
    baseUrl: logicalBase,
  }
}

async function browserListSkills(payload: ListPayload): Promise<ListResult> {
  const fetchBase = resolveFetchBase(payload.registryUrl, payload.type)
  const logicalBase = normalizeBaseUrl(payload.registryUrl)
  if (!fetchBase) return { ok: false, skills: [], message: '缺少 Registry URL', baseUrl: '' }

  const meta = { sourceId: payload.sourceId, sourceName: payload.sourceName, baseUrl: logicalBase }
  const limit = Math.min(Math.max(payload.limit ?? 50, 1), 100)
  const claw = isClawHub(payload)
  const market = marketplaceKind(payload)

  try {
    if (payload.useSession && payload.namespaces?.length) {
      return browserListByNamespaces(fetchBase, logicalBase, meta, payload.namespaces, limit)
    }

    if (market === 'skillsmp') {
      const q = (payload.query || '').trim()
      const url = q
        ? `${fetchBase}/api/v1/skills/search?q=${encodeURIComponent(q)}&limit=${limit}&sortBy=stars`
        : `${fetchBase}/api/skills?limit=${limit}&page=1&sortBy=stars`
      const res = await fetch(url, { headers: authHeaders(payload.token) })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return { ok: false, skills: [], message: `SkillsMP 拉取失败 HTTP ${res.status}`, baseUrl: logicalBase }
      }
      const items = body?.data?.skills || body?.skills || []
      const skills = (Array.isArray(items) ? items : [])
        .map((item) => mapSkillsMpItem(item, meta))
        .filter(Boolean) as Skill[]
      return { ok: true, skills, message: `已拉取 ${skills.length} 个 SkillsMP Skill`, baseUrl: logicalBase }
    }

    if (market === 'palebluedot') {
      const q = (payload.query || '').trim()
      const qs = new URLSearchParams({ limit: String(limit), page: '1', sort: 'stars' })
      if (q) qs.set('q', q)
      const res = await fetch(`${fetchBase}/api/skills?${qs}`, { headers: authHeaders(payload.token) })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return { ok: false, skills: [], message: `Pale Blue Dot 拉取失败 HTTP ${res.status}`, baseUrl: logicalBase }
      }
      const items = body?.skills || []
      const skills = (Array.isArray(items) ? items : [])
        .map((item) => mapPaleBlueDotItem(item, meta))
        .filter(Boolean) as Skill[]
      return { ok: true, skills, message: `已拉取 ${skills.length} 个 Pale Blue Dot Skill`, baseUrl: logicalBase }
    }

    if (claw) {
      const q = (payload.query || '').trim()
      let items: any[] = []
      if (q) {
        const res = await fetch(`${fetchBase}/api/v1/search?q=${encodeURIComponent(q)}&limit=${limit}`, {
          headers: authHeaders(payload.token),
        })
        const body = await res.json().catch(() => null)
        if (!res.ok) {
          return { ok: false, skills: [], message: `ClawHub 拉取失败 HTTP ${res.status}`, baseUrl: logicalBase }
        }
        items = body?.results || body?.items || []
      } else {
        let cursor = ''
        const pageSize = Math.min(limit, 50)
        for (let page = 0; page < 5 && items.length < limit; page++) {
          const qs = new URLSearchParams({ limit: String(pageSize), sort: 'updated' })
          if (cursor) qs.set('cursor', cursor)
          const res = await fetch(`${fetchBase}/api/v1/skills?${qs}`, { headers: authHeaders(payload.token) })
          const body = await res.json().catch(() => null)
          if (!res.ok) {
            if (items.length) break
            return { ok: false, skills: [], message: `ClawHub 拉取失败 HTTP ${res.status}`, baseUrl: logicalBase }
          }
          const batch = body?.items || []
          items.push(...batch)
          cursor = typeof body?.nextCursor === 'string' ? body.nextCursor : ''
          if (!cursor || !batch.length) break
        }
        items = items.slice(0, limit)
      }
      const skills = items.map((item) => mapClawHubItem(item, meta)).filter(Boolean) as Skill[]
      return { ok: true, skills, message: `已拉取 ${skills.length} 个 ClawHub Skill`, baseUrl: logicalBase }
    }

    const q = encodeURIComponent(payload.query || '')
    const url = `${fetchBase}/api/cli/v1/skills/search?q=${q}&limit=${limit}`
    const res = await fetch(url, { headers: authHeaders(payload.token) })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, skills: [], message: `列表拉取失败 HTTP ${res.status}`, baseUrl: logicalBase }
    }
    const items = body?.data?.items || body?.items || []
    const skills = (Array.isArray(items) ? items : [])
      .map((item) => mapSkillHubItem(item, meta))
      .filter(Boolean) as Skill[]
    return { ok: true, skills, message: `已拉取 ${skills.length} 个 Skill`, baseUrl: logicalBase }
  } catch (error) {
    return {
      ok: false,
      skills: [],
      message: error instanceof Error ? error.message : '列表拉取失败',
      baseUrl: logicalBase,
    }
  }
}

async function browserTestConnection(
  payload: Pick<SkillSource, 'registryUrl' | 'token' | 'type'>,
): Promise<TestResult> {
  const fetchBase = resolveFetchBase(payload.registryUrl, payload.type)
  const logicalBase = normalizeBaseUrl(payload.registryUrl)
  if (!fetchBase) return { ok: false, status: 'disconnected', message: '缺少 Registry URL', baseUrl: '' }

  try {
    const market = marketplaceKind(payload)
    if (market === 'skillsmp') {
      const res = await fetch(`${fetchBase}/api/skills?limit=1&sortBy=stars`, {
        headers: authHeaders(payload.token),
      })
      if (res.ok) {
        return { ok: true, status: 'connected', message: `SkillsMP API 可达 (${res.status})`, baseUrl: logicalBase }
      }
      return { ok: false, status: 'disconnected', message: `SkillsMP 连接失败 HTTP ${res.status}`, baseUrl: logicalBase }
    }
    if (market === 'palebluedot') {
      const res = await fetch(`${fetchBase}/api/skills?limit=1`, { headers: authHeaders(payload.token) })
      if (res.ok) {
        return { ok: true, status: 'connected', message: `Pale Blue Dot API 可达 (${res.status})`, baseUrl: logicalBase }
      }
      return {
        ok: false,
        status: 'disconnected',
        message: `Pale Blue Dot 连接失败 HTTP ${res.status}`,
        baseUrl: logicalBase,
      }
    }

    if (isClawHub(payload)) {
      const res = await fetch(`${fetchBase}/api/v1/skills?limit=1&sort=updated`, {
        headers: authHeaders(payload.token),
      })
      if (res.ok) {
        return { ok: true, status: 'connected', message: `ClawHub API 可达 (${res.status})`, baseUrl: logicalBase }
      }
      return { ok: false, status: 'disconnected', message: `ClawHub 连接失败 HTTP ${res.status}`, baseUrl: logicalBase }
    }

    const health = await fetch(`${fetchBase}/actuator/health`, { headers: authHeaders(payload.token) })
    if (health.ok) {
      return { ok: true, status: 'connected', message: `健康检查通过 (${health.status})`, baseUrl: logicalBase }
    }
    const search = await fetch(`${fetchBase}/api/cli/v1/skills/search?q=&limit=1`, {
      headers: authHeaders(payload.token),
    })
    if (search.ok) {
      return { ok: true, status: 'connected', message: `API 可达 (${search.status})`, baseUrl: logicalBase }
    }
    return { ok: false, status: 'disconnected', message: `连接失败 HTTP ${search.status}`, baseUrl: logicalBase }
  } catch (error) {
    return {
      ok: false,
      status: 'disconnected',
      message: error instanceof Error ? error.message : '连接失败',
      baseUrl: logicalBase,
    }
  }
}

export async function listSkillsFromSource(payload: ListPayload): Promise<ListResult> {
  const ipc = window.skillMesh?.sources?.listSkills
  if (ipc) return ipc(payload)
  return browserListSkills(payload)
}

export async function testSourceConnection(
  payload: Pick<SkillSource, 'registryUrl' | 'token' | 'type'>,
): Promise<TestResult> {
  const ipc = window.skillMesh?.sources?.testConnection
  if (ipc) return ipc(payload)
  return browserTestConnection(payload)
}
