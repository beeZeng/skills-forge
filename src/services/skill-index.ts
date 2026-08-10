import type { Skill } from '@/types'

export type SkillIndexMeta = {
  ok: boolean
  exists?: boolean
  count?: number
  updatedAt?: string | null
}

export type SkillIndexEntry = {
  uid: string
  skill_id?: string
  skillId?: string
  name: string
  description?: string
  tags?: string[]
  version?: string
  latestVersion?: string
  sourceId?: string
  sourceName?: string
  namespace?: string
  author?: string
  category?: string
  install_count?: number
  favorite_count?: number
  downloads?: number
  updatedAt?: string
  homepageUrl?: string
  githubUrl?: string
  packageSource?: Skill['packageSource']
  contentSource?: string
}

export function indexEntryToSkill(entry: SkillIndexEntry): Skill {
  return {
    uid: entry.uid,
    sourceId: entry.sourceId || 'unknown',
    sourceName: entry.sourceName || 'Skill Index',
    namespace: entry.namespace,
    skillId: entry.skillId || entry.skill_id || entry.uid,
    name: entry.name || entry.skillId || 'Untitled',
    description: entry.description || '',
    version: entry.version || '0.0.0',
    latestVersion: entry.latestVersion || entry.version || '0.0.0',
    author: entry.author,
    tags: entry.tags || [],
    category: entry.category || '未分类',
    homepageUrl: entry.homepageUrl,
    githubUrl: entry.githubUrl,
    packageSource: entry.packageSource,
    contentSource: entry.contentSource,
    installed: false,
    updateAvailable: false,
    favorite: false,
    downloads: entry.downloads ?? 0,
    installCount: entry.install_count ?? 0,
    favoriteCount: entry.favorite_count,
    syncedAgents: [],
    origin: 'catalog',
    updatedAt: entry.updatedAt,
  }
}

function api() {
  return window.skillMesh?.skillIndex
}

export async function getSkillIndexMeta(): Promise<SkillIndexMeta | null> {
  const fn = api()?.getMeta
  if (!fn) return null
  try {
    return await fn()
  } catch {
    return null
  }
}

export async function readSkillIndex(): Promise<{ skills: SkillIndexEntry[]; updatedAt?: string | null } | null> {
  const fn = api()?.readAll
  if (!fn) return null
  try {
    const res = await fn()
    if (!res?.ok) return null
    return { skills: (res.skills || []) as SkillIndexEntry[], updatedAt: res.updatedAt }
  } catch {
    return null
  }
}

export async function replaceSkillIndex(skills: Skill[]): Promise<{ ok: boolean; count?: number } | null> {
  const fn = api()?.replaceAll
  if (!fn) return null
  try {
    return await fn({
      skills: skills.filter((s) => s.origin !== 'created' && s.origin !== 'imported') as unknown as Array<
        Record<string, unknown>
      >,
      updatedAt: new Date().toISOString(),
    })
  } catch {
    return null
  }
}

export async function searchSkillIndex(query: string, limit = 12): Promise<Skill[]> {
  const fn = api()?.search
  if (!fn) return []
  try {
    const res = await fn({ query, limit })
    if (!res?.ok) return []
    return ((res.skills || []) as SkillIndexEntry[]).map(indexEntryToSkill)
  } catch {
    return []
  }
}
