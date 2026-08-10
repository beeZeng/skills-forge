import type { Skill, SkillBadge } from '@/types'

export type SkillStatsPayload = {
  skill_id?: string
  skillId?: string
  uid?: string
  name?: string
  version?: string
  baselineDownloads?: number
  updatedAt?: string
  createdAt?: string
  userId?: string
  agent_type?: string
  agentType?: string
  offline?: boolean
}

export type SkillStatsResult = {
  ok: boolean
  error?: string
  counted?: boolean
  reason?: string
  skill_id?: string
  views?: number
  favorites?: number
  downloads?: number
  installs?: number
  usage?: number
  score?: number
  recentGrowth?: number
  badges?: SkillBadge[]
  favorited?: boolean
}

/** Canonical analytics key — stable across catalog refresh when possible. */
export function analyticsSkillId(skill: Pick<Skill, 'uid' | 'skillId' | 'namespace' | 'manifest' | 'sourceId'>): string {
  if (skill.manifest?.skill_id) return skill.manifest.skill_id
  if (skill.namespace && skill.skillId) return `${skill.namespace}.${skill.skillId}`
  if (skill.skillId && skill.sourceId) return `${skill.sourceId}:${skill.skillId}`
  return skill.uid
}

export function statsMetaFromSkill(skill: Skill, userId?: string): SkillStatsPayload {
  return {
    skill_id: analyticsSkillId(skill),
    uid: skill.uid,
    name: skill.name,
    version: skill.latestVersion || skill.version,
    // Only real catalog download metrics — never GitHub stars
    baselineDownloads: skill.downloadCount ?? skill.downloads ?? 0,
    updatedAt: skill.updatedAt,
    userId,
  }
}

function api() {
  return window.skillMesh?.analytics
}

export async function getSkillStats(payload: SkillStatsPayload): Promise<SkillStatsResult | null> {
  const fn = api()?.getStats
  if (!fn) return null
  try {
    return await fn(payload)
  } catch {
    return null
  }
}

export async function getBulkSkillStats(
  items: SkillStatsPayload[],
  userId?: string,
): Promise<Record<string, SkillStatsResult> | null> {
  const fn = api()?.getBulkStats
  if (!fn) return null
  try {
    const res = await fn({ items, userId })
    return res?.ok ? (res.stats as Record<string, SkillStatsResult>) : null
  } catch {
    return null
  }
}

export async function recordSkillView(payload: SkillStatsPayload): Promise<SkillStatsResult | null> {
  const fn = api()?.recordView
  if (!fn) return null
  try {
    return await fn(payload)
  } catch {
    return null
  }
}

export async function favoriteSkill(payload: SkillStatsPayload): Promise<SkillStatsResult | null> {
  const fn = api()?.favorite
  if (!fn) return null
  try {
    return await fn(payload)
  } catch {
    return null
  }
}

export async function unfavoriteSkill(payload: SkillStatsPayload): Promise<SkillStatsResult | null> {
  const fn = api()?.unfavorite
  if (!fn) return null
  try {
    return await fn(payload)
  } catch {
    return null
  }
}

export async function recordSkillDownload(payload: SkillStatsPayload): Promise<SkillStatsResult | null> {
  const fn = api()?.recordDownload
  if (!fn) return null
  try {
    return await fn(payload)
  } catch {
    return null
  }
}

export async function recordSkillInstall(payload: SkillStatsPayload): Promise<SkillStatsResult | null> {
  const fn = api()?.recordInstall
  if (!fn) return null
  try {
    return await fn(payload)
  } catch {
    return null
  }
}

export function applyStatsToSkill(skill: Skill, stats?: SkillStatsResult | null): Skill {
  if (!stats || !stats.ok) return skill
  return {
    ...skill,
    viewCount: stats.views ?? skill.viewCount,
    favoriteCount: stats.favorites ?? skill.favoriteCount,
    downloadCount: stats.downloads ?? skill.downloadCount,
    installCount: stats.installs ?? skill.installCount,
    usageCount: stats.usage ?? skill.usageCount,
    skillScore: stats.score ?? skill.skillScore,
    badges: (stats.badges as SkillBadge[] | undefined) || skill.badges,
  }
}

export function skillHotScore(skill: Skill): number {
  if (typeof skill.skillScore === 'number') return skill.skillScore
  const installs = skill.installCount ?? skill.downloads ?? 0
  const favorites = skill.favoriteCount ?? (skill.favorite ? 1 : 0)
  const growth = 0
  return installs * 0.5 + favorites * 0.3 + growth * 0.2
}
