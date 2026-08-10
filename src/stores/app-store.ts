import { create } from 'zustand'
import {
  CATEGORY_CHIPS,
  DEFAULT_AGENTS,
  DEFAULT_SOURCES,
  LEGACY_MOCK_SKILL_UIDS,
} from '@/constants/defaults'
import { DEFAULT_PANGU_HUB_URL, HUB_HEARTBEAT_MS, PANGU_HUB_NAME, PANGU_HUB_SOURCE_ID } from '@/constants/pangu'
import { CATALOG_STALE_MS } from '@/constants/sync'
import { hubLogin, hubLogout, hubMe, hubMyNamespaces, normalizeHubBaseUrl } from '@/services/hub-auth'
import { savePersistedState } from '@/services/persistence'
import { listSkillsFromSource, testSourceConnection } from '@/services/skillhub-client'
import { uid } from '@/lib/utils'
import type {
  AgentInstallation,
  AppAccount,
  AppTheme,
  DiscoverTab,
  DiscoveredHub,
  MineTab,
  NotificationItem,
  PersistedUiState,
  PublishItem,
  PublishStatus,
  Skill,
  SkillVisibility,
  SkillInstallFilter,
  SkillSort,
  SkillSource,
  SourceStatus,
  TaskItem,
  TaskKind,
  ToastItem,
  ToastTone,
} from '@/types'

let hubHeartbeatTimer: ReturnType<typeof setInterval> | null = null

async function confirmDialog(opts: { title: string; message: string; detail?: string }) {
  if (window.skillMesh?.dialog?.confirm) {
    return window.skillMesh.dialog.confirm(opts)
  }
  return window.confirm([opts.message, opts.detail].filter(Boolean).join('\n'))
}

interface AppState {
  hydrated: boolean
  sidebarCollapsed: boolean
  discoverSearchQuery: string
  installedSearchQuery: string
  discoverTab: DiscoverTab
  mineTab: MineTab
  sourceFilter: string
  categoryFilter: string
  statusFilter: SkillInstallFilter
  sortBy: SkillSort
  batchMode: boolean
  selectedUids: string[]
  selectedSkillUid: string | null
  drawerOpen: boolean
  skills: Skill[]
  sources: SkillSource[]
  agents: AgentInstallation[]
  tasks: TaskItem[]
  publishItems: PublishItem[]
  publishFilter: 'all' | PublishStatus
  notifications: NotificationItem[]
  highlightTaskId: string | null
  storageUsedGb: number
  storageTotalGb: number
  syncServiceRunning: boolean
  theme: AppTheme
  newSkillsFolder: string
  agentPathOverrides: Record<string, string>
  restartRequired: boolean
  catalogSyncing: boolean
  catalogSyncMessage: string | null
  lastCatalogSyncedAt: string | null
  defaultSyncAgentIds: string[]
  toast: ToastItem | null
  account: AppAccount
  discoveredHub: DiscoveredHub | null
  loginOpen: boolean
  panguHubUrl: string

  hydrate: (persisted: PersistedUiState | null) => void
  persist: () => void
  toggleSidebar: () => void
  setLoginOpen: (open: boolean) => void
  login: (payload: { username: string; password: string }) => Promise<{ ok: boolean; message?: string }>
  logout: () => Promise<void>
  refreshAccount: () => Promise<void>
  discoverPanguHub: () => Promise<void>
  connectDiscoveredHub: () => Promise<void>
  startHubHeartbeat: () => void
  stopHubHeartbeat: () => void
  runHubHeartbeat: () => Promise<void>
  ensureCatalogFresh: () => Promise<{ ok: boolean; message: string; skipped?: boolean }>
  retryFailedSources: () => Promise<{ ok: boolean; message: string }>
  setDefaultSyncAgentIds: (ids: string[]) => void
  toggleDefaultSyncAgent: (agentId: string) => void
  setDiscoverSearchQuery: (q: string) => void
  setInstalledSearchQuery: (q: string) => void
  setDiscoverTab: (tab: DiscoverTab) => void
  setMineTab: (tab: MineTab) => void
  setSourceFilter: (id: string) => void
  setCategoryFilter: (c: string) => void
  setStatusFilter: (s: SkillInstallFilter) => void
  setSortBy: (s: SkillSort) => void
  resetDiscoverFilters: () => void
  setBatchMode: (v: boolean) => void
  toggleSelected: (uid: string) => void
  clearSelection: () => void
  installSelected: () => void
  updateSelected: () => void
  openSkill: (uid: string) => void
  closeDrawer: () => void
  toggleFavorite: (uid: string) => void
  installSkill: (uid: string) => void
  updateSkill: (uid: string) => void
  updateAll: () => void
  deleteSkill: (uid: string) => Promise<void>
  toggleAgentSync: (skillUid: string, agentId: string) => void
  importLocalSkill: (filePath?: string | null) => void
  createSkill: (payload: { name: string; description?: string; content: string }) => void
  setNewSkillsFolder: (folder: string) => void
  isAgentSyncBusy: (skillUid: string, agentId: string) => boolean
  retryTask: (taskId: string) => void
  cancelTask: (taskId: string) => void
  addSource: (source: Omit<SkillSource, 'id' | 'status'> & { id?: string }) => void
  updateSource: (id: string, patch: Partial<SkillSource>) => void
  removeSource: (id: string) => Promise<void>
  testSource: (id: string) => Promise<void>
  refreshCatalog: (
    options?: string | { sourceId?: string; force?: boolean; silent?: boolean },
  ) => Promise<{ ok: boolean; message: string; skipped?: boolean }>
  scanAgents: () => Promise<void>
  setAgents: (agents: AgentInstallation[]) => void
  saveAgentPathOverrides: (overrides: Record<string, string>) => Promise<'relaunch' | 'later' | 'cancel'>
  applyAgentPathOverrides: (agents: AgentInstallation[]) => AgentInstallation[]
  submitPublish: (payload: {
    skillUid: string
    namespace: string
    visibility: SkillVisibility
    version?: string
    confirmWarnings?: boolean
  }) => Promise<{ ok: boolean; message?: string; confirmRequired?: boolean }>
  withdrawPublishReview: (publishId: string) => Promise<{ ok: boolean; message?: string }>
  deletePublishedSkill: (publishId: string) => Promise<{ ok: boolean; message?: string }>
  refreshPublishStatuses: (options?: { silent?: boolean }) => Promise<{ ok: boolean; updated: number; message?: string }>
  setPublishFilter: (f: 'all' | PublishStatus) => void
  pushNotification: (msg: string, taskId?: string, tone?: ToastTone) => void
  markNotificationsRead: () => void
  markNotificationRead: (id: string) => void
  showToast: (message: string, tone?: ToastTone) => void
  clearToast: () => void
  setHighlightTaskId: (taskId: string | null) => void
  setTheme: (theme: AppTheme) => void
  setSyncServiceRunning: (running: boolean) => void
  clearStorageCache: () => void
  openSkillDirectory: (skillUid: string) => Promise<void>
  goDiscoverUpdates: () => void
}

function normalizeSourceUrl(url?: string) {
  if (!url) return ''
  return url.trim().replace(/\/+$/, '').toLowerCase()
}

function isPanguSource(source: SkillSource) {
  return source.id === PANGU_HUB_SOURCE_ID || !!source.accountBound
}

/** Pangu Hub is account-bound — never keep it in the source list while logged out. */
function withoutPanguSources(sources: SkillSource[]) {
  return sources.filter((source) => !isPanguSource(source))
}

function withoutGuestPanguSkills(skills: Skill[]) {
  return skills.filter(
    (skill) =>
      skill.sourceId !== PANGU_HUB_SOURCE_ID ||
      skill.installed ||
      skill.origin === 'created' ||
      skill.origin === 'imported',
  )
}

function mapRemotePublishStatus(status?: string): PublishStatus {
  const s = (status || '').toUpperCase()
  if (s === 'PUBLISHED') return 'published'
  if (s === 'UPLOADED' || s === 'DRAFT') return 'uploaded'
  if (s === 'REJECTED') return 'rejected'
  if (s === 'PENDING_REVIEW' || s === 'SCANNING' || s === 'SCAN_FAILED') return 'reviewing'
  if (s === 'YANKED') return 'withdrawn'
  return 'reviewing'
}

function skillStatus(skill: Skill): SkillInstallFilter {
  if (!skill.installed) return 'not_installed'
  if (skill.updateAvailable) return 'update_available'
  return 'installed'
}

function applyPersisted(skills: Skill[], persisted: PersistedUiState | null): Skill[] {
  if (!persisted) return skills
  return skills.map((skill) => {
    const override = persisted.skillOverrides?.[skill.uid] ?? {}
    const installed = persisted.installedUids?.includes(skill.uid) ?? skill.installed
    const favorite = persisted.favorites?.includes(skill.uid) ?? skill.favorite
    const syncedAgents = persisted.syncedAgents?.[skill.uid] ?? skill.syncedAgents
    const merged = { ...skill, ...override, installed, favorite, syncedAgents }
    if (merged.installed && merged.latestVersion && merged.version !== merged.latestVersion) {
      merged.updateAvailable = true
    }
    if (merged.installed && merged.latestVersion && merged.version === merged.latestVersion) {
      merged.updateAvailable = false
    }
    return merged
  })
}

/** Rebuild installed catalog rows from persistence (no seed catalog). */
function installedStubsFromPersisted(persisted: PersistedUiState | null): Skill[] {
  if (!persisted?.installedUids?.length) return []
  const ownedUids = new Set((persisted.createdSkills ?? []).map((s) => s.uid))
  return persisted.installedUids
    .filter((skillUid) => !LEGACY_MOCK_SKILL_UIDS.has(skillUid) && !ownedUids.has(skillUid))
    .map((skillUid) => {
      const override = persisted.skillOverrides?.[skillUid] ?? {}
      const parts = skillUid.split(':')
      const sourceId = parts[0] || 'unknown'
      const namespace = parts.length >= 3 ? parts[1] : undefined
      const skillId = parts.length >= 3 ? parts.slice(2).join(':') : parts[1] || skillUid
      const version = override.version || '0.0.0'
      const latestVersion = override.latestVersion || version
      return {
        uid: skillUid,
        sourceId,
        sourceName: sourceId,
        namespace,
        skillId,
        name: skillId,
        description: '',
        version,
        latestVersion,
        author: '',
        tags: [],
        category: '',
        sizeLabel: '',
        license: '',
        updatedAt: '',
        installed: true,
        updateAvailable: Boolean(override.updateAvailable ?? (version !== latestVersion)),
        favorite: persisted.favorites?.includes(skillUid) ?? false,
        downloads: 0,
        syncedAgents: persisted.syncedAgents?.[skillUid] ?? [],
        localPath: override.localPath,
        origin: override.origin,
      } satisfies Skill
    })
}

function formatTaskTime(iso = new Date().toISOString()) {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

const TASK_KIND_LABEL: Record<TaskKind, string> = {
  download: '下载',
  install: '安装',
  update: '更新',
  delete: '删除',
  import: '导入',
  parse: '解析',
  sync: '同步到智能体',
  unsync: '取消智能体同步',
  publish: '发布',
  create: '新建',
}

const DEFAULT_NEW_SKILLS_FOLDER = '~/new_skills'

const APP_THEMES: AppTheme[] = [
  'system',
  'dark',
  'light',
  'sapphiredusk',
  'tron',
  'gildedgrove',
  'gloom',
  'desertbloom',
]

const LEGACY_THEME_MAP: Record<string, AppTheme> = {
  blue: 'sapphiredusk',
  floral: 'gildedgrove',
  pink: 'gloom',
}

function normalizeTheme(theme: string | undefined): AppTheme {
  if (!theme) return 'dark'
  if ((APP_THEMES as string[]).includes(theme)) return theme as AppTheme
  return LEGACY_THEME_MAP[theme] ?? 'dark'
}

function applyTheme(theme: AppTheme) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
}

function buildTaskMeta(
  kind: TaskKind,
  options: {
    skill?: Skill
    agent?: AgentInstallation
    phase?: string
    sourceName?: string
  } = {},
): Pick<TaskItem, 'title' | 'subtitle' | 'kindLabel' | 'skillName' | 'sourceName' | 'sizeLabel' | 'agentName' | 'detail'> {
  const { skill, agent, phase, sourceName } = options
  const kindLabel = TASK_KIND_LABEL[kind]
  const now = formatTaskTime()
  const hub = sourceName || skill?.sourceName
  const lines = [
    `类型：${kindLabel}`,
    skill ? `Skill：${skill.name}` : null,
    hub ? `来源：${hub}` : null,
    skill?.sizeLabel ? `大小：${skill.sizeLabel}` : null,
    agent ? `智能体：${agent.name}` : null,
    phase ? `阶段：${phase}` : null,
    `时间：${now}`,
  ].filter(Boolean)

  return {
    title: skill ? `${kindLabel} · ${skill.name}` : kindLabel,
    subtitle: lines.join(' · '),
    kindLabel,
    skillName: skill?.name,
    sourceName: hub,
    sizeLabel: skill?.sizeLabel,
    agentName: agent?.name,
    detail: lines.join('\n'),
  }
}

async function ensureSkillPackageOnDisk(skill: Skill): Promise<string | undefined> {
  if (window.skillMesh?.skills?.ensurePackage) {
    const result = await window.skillMesh.skills.ensurePackage({
      skillId: skill.skillId,
      name: skill.name,
      description: skill.description,
      version: skill.latestVersion || skill.version,
      sourceId: skill.sourceId,
      sourceName: skill.sourceName,
      namespace: skill.namespace,
      latestVersion: skill.latestVersion,
      localPath: skill.localPath,
      content: skill.content,
    })
    return result.localPath
  }
  if (skill.localPath) return skill.localPath
  const version = skill.latestVersion || skill.version
  return `~/.skillmesh/skills/${skill.sourceId}/${skill.namespace || 'default'}/${skill.skillId}/${version}`
}

function isLocalMineSkill(skill: Skill) {
  return skill.origin === 'created' || skill.origin === 'imported'
}

function isHubInstalledSkill(skill: Skill) {
  return skill.installed && !isLocalMineSkill(skill)
}

async function syncSkillToAgent(skill: Skill, agent: AgentInstallation, action: 'link' | 'unlink') {
  if (!agent.skillPath || !window.skillMesh?.agents?.syncSkill) return { ok: true }
  return window.skillMesh.agents.syncSkill({
    action,
    skill: {
      skillId: skill.skillId,
      name: skill.name,
      description: skill.description,
      version: skill.version,
      sourceId: skill.sourceId,
      sourceName: skill.sourceName,
      namespace: skill.namespace,
      localPath: skill.localPath,
    },
    agentSkillPath: agent.skillPath,
  })
}

async function resyncSkillToAgents(get: () => AppState, skillUid: string) {
  const state = get()
  const skill = state.skills.find((s) => s.uid === skillUid)
  if (!skill?.localPath || !skill.syncedAgents.length) return
  for (const agentId of skill.syncedAgents) {
    const agent = state.agents.find((a) => a.id === agentId)
    if (agent?.installed && agent.skillPath) {
      await syncSkillToAgent(skill, agent, 'link')
    }
  }
}

/** Link a newly installed Skill to configured default agents. */
async function applyDefaultAgentSync(
  get: () => AppState,
  set: (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void,
  skillUid: string,
) {
  const defaults = get().defaultSyncAgentIds
  if (!defaults.length) return [] as string[]
  let skill = get().skills.find((s) => s.uid === skillUid)
  if (!skill?.localPath || !skill.installed) return [] as string[]

  const linked: string[] = []
  for (const agentId of defaults) {
    skill = get().skills.find((s) => s.uid === skillUid)
    if (!skill) break
    if (skill.syncedAgents.includes(agentId)) continue
    const agent = get().agents.find((a) => a.id === agentId && a.installed && a.skillPath)
    if (!agent) continue
    const result = await syncSkillToAgent(skill, agent, 'link')
    if (!result?.ok) continue
    linked.push(agent.name)
    set((s) => ({
      skills: s.skills.map((item) =>
        item.uid === skillUid
          ? { ...item, syncedAgents: Array.from(new Set([...item.syncedAgents, agentId])) }
          : item,
      ),
    }))
  }
  return linked
}

function normalizeRefreshOptions(
  options?: string | { sourceId?: string; force?: boolean; silent?: boolean },
) {
  if (typeof options === 'string') {
    return { sourceId: options, force: true as boolean, silent: false }
  }
  return {
    sourceId: options?.sourceId,
    force: options?.force !== false,
    silent: !!options?.silent,
  }
}

function formatSyncTime(iso?: string | null) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString()
  } catch {
    return ''
  }
}

function createTask(partial: Omit<TaskItem, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: TaskItem['status'] }): TaskItem {
  const now = new Date().toISOString()
  return {
    id: uid('task'),
    status: partial.status ?? 'pending',
    createdAt: now,
    updatedAt: now,
    progress: partial.progress ?? 0,
    ...partial,
  }
}

async function runProgress(
  get: () => AppState,
  set: (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void,
  taskId: string,
  onDone: () => void,
) {
  const steps = [12, 28, 45, 68, 86, 100]
  for (const progress of steps) {
    await new Promise((r) => setTimeout(r, 280 + Math.random() * 220))
    const current = get().tasks.find((t) => t.id === taskId)
    if (!current || current.status === 'cancelled') return
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: progress >= 100 ? 'success' : 'running',
              progress,
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    }))
  }
  onDone()
  get().persist()
}

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  sidebarCollapsed: false,
  discoverSearchQuery: '',
  installedSearchQuery: '',
  discoverTab: 'recommended',
  mineTab: 'all',
  sourceFilter: 'all',
  categoryFilter: '全部',
  statusFilter: 'all',
  sortBy: 'recommended',
  batchMode: false,
  selectedUids: [],
  selectedSkillUid: null,
  drawerOpen: false,
  skills: [],
  sources: DEFAULT_SOURCES,
  agents: DEFAULT_AGENTS,
  tasks: [],
  publishItems: [],
  publishFilter: 'all',
  notifications: [],
  highlightTaskId: null,
  storageUsedGb: 0,
  storageTotalGb: 100,
  syncServiceRunning: true,
  theme: 'dark',
  newSkillsFolder: DEFAULT_NEW_SKILLS_FOLDER,
  agentPathOverrides: {},
  restartRequired: false,
  catalogSyncing: false,
  catalogSyncMessage: null,
  lastCatalogSyncedAt: null,
  defaultSyncAgentIds: [],
  toast: null,
  account: { loggedIn: false, hubBaseUrl: DEFAULT_PANGU_HUB_URL },
  discoveredHub: null,
  loginOpen: false,
  panguHubUrl: DEFAULT_PANGU_HUB_URL,

  hydrate: (persisted) => {
    const theme = normalizeTheme(persisted?.theme)
    applyTheme(theme)
    const panguHubUrl = normalizeHubBaseUrl(persisted?.panguHubUrl || DEFAULT_PANGU_HUB_URL) || DEFAULT_PANGU_HUB_URL
    const owned = applyPersisted(
      (persisted?.createdSkills ?? []).filter(
        (s) =>
          (s.origin === 'created' || s.origin === 'imported') && !LEGACY_MOCK_SKILL_UIDS.has(s.uid),
      ),
      persisted,
    )
    const installedStubs = installedStubsFromPersisted(persisted)
    const ownedUids = new Set(owned.map((s) => s.uid))
    const mergedSkills = [...owned, ...installedStubs.filter((s) => !ownedUids.has(s.uid))]
    const overrides = persisted?.agentPathOverrides ?? {}
    const agents = DEFAULT_AGENTS.map((agent) => {
      const defaultSkillPath = agent.defaultSkillPath || agent.skillPath
      return {
        ...agent,
        defaultSkillPath,
        skillPath: overrides[agent.id] || defaultSkillPath,
      }
    })
    let sources = persisted?.sources?.length ? persisted.sources : DEFAULT_SOURCES

    // Drop test/demo sources (localhost SkillHub fixtures, fake private hubs)
    sources = sources.filter((s) => {
      if (s.id === 'local-skillhub') return false
      if (s.id === 'private' || s.id === 'pangu') return false
      // Localhost only kept when it is the account-bound Pangu Hub (and only while logged in)
      const isLocalhost = /localhost|127\.0\.0\.1/i.test(s.registryUrl || '')
      if (isLocalhost && !s.accountBound && s.id !== PANGU_HUB_SOURCE_ID) return false
      return true
    })

    const accountHint = persisted?.accountHint
    // Guest / session not restored yet: never show a leftover connected Pangu Hub
    if (!accountHint?.loggedIn) {
      sources = withoutPanguSources(sources)
    } else {
      // Session will be revalidated asynchronously — don't show stale "connected"
      sources = sources.map((s) =>
        isPanguSource(s)
          ? { ...s, status: 'disconnected' as SourceStatus, authStatus: 'checking' as const }
          : s,
      )
    }

    // Fix legacy fake ClawHub URL (/registry) → real ClawHub base
    sources = sources.map((s) => {
      if (s.id === 'clawhub' || s.type === 'clawhub' || /clawhub\.(ai|com)/i.test(s.registryUrl || '')) {
        const url = (s.registryUrl || '').replace(/\/registry\/?$/i, '').replace(/\/+$/, '')
        return {
          ...s,
          type: 'clawhub' as const,
          name: s.name || 'ClawHub',
          registryUrl: url && /clawhub\.(ai|com)/i.test(url) ? url : 'https://clawhub.ai',
          enabled: s.enabled !== false,
        }
      }
      return s
    })
    if (!sources.some((s) => s.type === 'clawhub' || s.id === 'clawhub')) {
      sources = [
        ...sources.filter((s) => s.id !== 'local'),
        {
          id: 'clawhub',
          name: 'ClawHub',
          type: 'clawhub',
          registryUrl: 'https://clawhub.ai',
          enabled: true,
          status: 'disconnected',
        },
        ...sources.filter((s) => s.id === 'local'),
      ]
    }
    // Ensure well-known public registries exist
    const wellKnown: SkillSource[] = [
      {
        id: 'xfyun-skillhub',
        name: '讯飞 SkillHub',
        type: 'custom',
        registryUrl: 'https://skill.xfyun.cn',
        enabled: true,
        status: 'disconnected',
      },
      {
        id: 'skillsmp',
        name: 'SkillsMP',
        type: 'skillsmp',
        registryUrl: 'https://skillsmp.com',
        enabled: true,
        status: 'disconnected',
      },
      {
        id: 'palebluedot',
        name: 'Pale Blue Dot',
        type: 'palebluedot',
        registryUrl: 'https://skills.palebluedot.live',
        enabled: true,
        status: 'disconnected',
      },
    ]
    for (const known of wellKnown) {
      const exists = sources.some(
        (s) =>
          s.id === known.id ||
          (known.registryUrl &&
            normalizeSourceUrl(s.registryUrl) === normalizeSourceUrl(known.registryUrl)),
      )
      if (!exists) {
        const offlineIdx = sources.findIndex((s) => s.id === 'local' || s.type === 'offline')
        if (offlineIdx >= 0) {
          sources = [...sources.slice(0, offlineIdx), known, ...sources.slice(offlineIdx)]
        } else {
          sources = [...sources, known]
        }
      } else {
        sources = sources.map((s) => {
          if (s.id !== known.id && normalizeSourceUrl(s.registryUrl) !== normalizeSourceUrl(known.registryUrl)) {
            return s
          }
          return {
            ...s,
            type: known.type,
            name: s.name || known.name,
            registryUrl: known.registryUrl,
            enabled: s.enabled !== false,
          }
        })
      }
    }

    // Drop catalog skills that belonged to removed test sources (keep installed/local)
    const sourceIds = new Set(sources.map((s) => s.id))
    let cleanedSkills = mergedSkills.filter(
      (skill) =>
        !LEGACY_MOCK_SKILL_UIDS.has(skill.uid) &&
        (sourceIds.has(skill.sourceId) ||
          skill.installed ||
          skill.origin === 'created' ||
          skill.origin === 'imported'),
    )
    if (!accountHint?.loggedIn) {
      cleanedSkills = withoutGuestPanguSkills(cleanedSkills)
    }
    set({
      hydrated: true,
      skills: cleanedSkills,
      sources,
      // Drop legacy mock publish rows (no remote slug)
      publishItems: (persisted?.publishItems ?? []).filter(
        (item) => !!item.slug && !!item.namespace,
      ),
      // Drop old mock publish tasks that never hit the server
      tasks: (persisted?.tasks ?? []).filter(
        (t) =>
          !(t.kind === 'publish' && t.status === 'success' && /已提交审核/.test(t.subtitle || t.title || '')),
      ),
      sidebarCollapsed: persisted?.sidebarCollapsed ?? false,
      theme,
      newSkillsFolder: persisted?.newSkillsFolder || DEFAULT_NEW_SKILLS_FOLDER,
      agentPathOverrides: overrides,
      agents,
      panguHubUrl,
      account: {
        loggedIn: false,
        hubBaseUrl: panguHubUrl,
        userId: accountHint?.userId,
        displayName: accountHint?.displayName,
        email: accountHint?.email,
      },
      discoveredHub: null,
      defaultSyncAgentIds: persisted?.defaultSyncAgentIds ?? [],
      lastCatalogSyncedAt: persisted?.lastCatalogSyncedAt ?? null,
      catalogSyncMessage: persisted?.lastCatalogSyncedAt
        ? `列表缓存 · 上次刷新 ${formatSyncTime(persisted.lastCatalogSyncedAt)}`
        : null,
    })

    void get().ensureCatalogFresh().catch(() => undefined)
    if (accountHint?.loggedIn) {
      void get().refreshAccount()
    }
  },

  setLoginOpen: (open) => set({ loginOpen: open }),

  login: async ({ username, password }) => {
    const baseUrl = get().panguHubUrl || DEFAULT_PANGU_HUB_URL
    const result = await hubLogin({ baseUrl, username, password })
    if (!result.ok || !result.account) {
      get().showToast(result.message || '登录失败', 'error')
      return { ok: false, message: result.message }
    }
    set({
      account: { ...result.account, hubBaseUrl: baseUrl, loggedIn: true },
      loginOpen: false,
      panguHubUrl: baseUrl,
    })
    get().showToast(`已登录 ${result.account.displayName || username}`, 'success')
    get().persist()
    await get().discoverPanguHub()
    if (get().sources.some((s) => s.id === PANGU_HUB_SOURCE_ID && s.accountBound)) {
      get().startHubHeartbeat()
      await get().refreshCatalog(PANGU_HUB_SOURCE_ID)
    }
    return { ok: true }
  },

  logout: async () => {
    get().stopHubHeartbeat()
    const baseUrl = get().account.hubBaseUrl || get().panguHubUrl
    await hubLogout(baseUrl)
    set((s) => ({
      account: { loggedIn: false, hubBaseUrl: s.panguHubUrl },
      discoveredHub: null,
      sources: withoutPanguSources(s.sources),
      skills: withoutGuestPanguSkills(s.skills),
    }))
    get().showToast('已退出登录', 'info')
    get().persist()
  },

  refreshAccount: async () => {
    const baseUrl = get().panguHubUrl || DEFAULT_PANGU_HUB_URL
    const result = await hubMe(baseUrl)
    if (!result.ok || !result.loggedIn || !result.account) {
      get().stopHubHeartbeat()
      set((s) => ({
        account: { loggedIn: false, hubBaseUrl: baseUrl },
        discoveredHub: null,
        sources: withoutPanguSources(s.sources),
        skills: withoutGuestPanguSkills(s.skills),
      }))
      get().persist()
      return
    }
    set({
      account: { ...result.account, loggedIn: true, hubBaseUrl: baseUrl },
      panguHubUrl: baseUrl,
    })
    get().persist()
    await get().discoverPanguHub()
    if (get().sources.some((s) => s.id === PANGU_HUB_SOURCE_ID && s.accountBound && s.enabled)) {
      get().startHubHeartbeat()
    }
  },

  discoverPanguHub: async () => {
    const account = get().account
    if (!account.loggedIn) {
      set({ discoveredHub: null })
      return
    }
    const baseUrl = account.hubBaseUrl || get().panguHubUrl
    const result = await hubMyNamespaces(baseUrl)
    if (!result.ok) {
      if (result.unauthorized) {
        get().stopHubHeartbeat()
        set((s) => ({
          account: { loggedIn: false, hubBaseUrl: baseUrl },
          discoveredHub: null,
          sources: withoutPanguSources(s.sources),
          skills: withoutGuestPanguSkills(s.skills),
        }))
        get().showToast('登录已失效，请重新登录', 'warning')
        get().persist()
      }
      return
    }
    const namespaces = result.namespaces || []
    const connected = get().sources.some(
      (s) =>
        s.id === PANGU_HUB_SOURCE_ID &&
        s.accountBound &&
        s.enabled &&
        s.authStatus !== 'lost' &&
        normalizeSourceUrl(s.registryUrl) === normalizeSourceUrl(baseUrl),
    )
    if (!namespaces.length) {
      set({
        discoveredHub: connected
          ? { baseUrl, name: PANGU_HUB_NAME, namespaces: [], connected: true }
          : null,
      })
      return
    }
    set({
      discoveredHub: {
        baseUrl,
        name: PANGU_HUB_NAME,
        namespaces,
        connected,
      },
    })
    if (connected) {
      const prev = get().sources.find((s) => s.id === PANGU_HUB_SOURCE_ID)
      const prevSlugs = new Set((prev?.namespaces || []).map((n) => n.slug))
      const nextSlugs = new Set(namespaces.map((n) => n.slug))
      const changed =
        prevSlugs.size !== nextSlugs.size || [...nextSlugs].some((slug) => !prevSlugs.has(slug))
      set((s) => ({
        sources: s.sources.map((src) =>
          src.id === PANGU_HUB_SOURCE_ID
            ? { ...src, namespaces, authStatus: 'ok', status: 'connected' as SourceStatus }
            : src,
        ),
        discoveredHub: { baseUrl, name: PANGU_HUB_NAME, namespaces, connected: true },
      }))
      if (changed) {
        await get().refreshCatalog(PANGU_HUB_SOURCE_ID)
      }
      get().persist()
    }
  },

  connectDiscoveredHub: async () => {
    const hub = get().discoveredHub
    const account = get().account
    if (!account.loggedIn) {
      get().showToast('请先登录 SkillHub 账号', 'warning')
      set({ loginOpen: true })
      return
    }
    if (!hub?.namespaces.length) {
      get().showToast('未检测到可用命名空间', 'warning')
      return
    }
    const baseUrl = hub.baseUrl || get().panguHubUrl
    const namespaces = hub.namespaces
    set((s) => {
      const withoutDupes = s.sources.filter(
        (src) =>
          src.id === PANGU_HUB_SOURCE_ID ||
          normalizeSourceUrl(src.registryUrl) !== normalizeSourceUrl(baseUrl),
      )
      const existing = withoutDupes.find((src) => src.id === PANGU_HUB_SOURCE_ID)
      const panguSource: SkillSource = {
        id: PANGU_HUB_SOURCE_ID,
        name: PANGU_HUB_NAME,
        type: 'custom',
        registryUrl: baseUrl,
        enabled: true,
        status: 'connected',
        accountBound: true,
        namespaces,
        authStatus: 'ok',
        token: existing?.token,
      }
      const rest = withoutDupes.filter((src) => src.id !== PANGU_HUB_SOURCE_ID)
      return {
        sources: [panguSource, ...rest],
        discoveredHub: { ...hub, baseUrl, connected: true, namespaces },
      }
    })
    get().showToast(`已连接 ${PANGU_HUB_NAME}（${namespaces.length} 个命名空间）`, 'success')
    get().persist()
    get().startHubHeartbeat()
    await get().refreshCatalog(PANGU_HUB_SOURCE_ID)
  },

  startHubHeartbeat: () => {
    get().stopHubHeartbeat()
    hubHeartbeatTimer = setInterval(() => {
      void get().runHubHeartbeat()
    }, HUB_HEARTBEAT_MS)
  },

  stopHubHeartbeat: () => {
    if (hubHeartbeatTimer) {
      clearInterval(hubHeartbeatTimer)
      hubHeartbeatTimer = null
    }
  },

  runHubHeartbeat: async () => {
    const account = get().account
    const pangu = get().sources.find((s) => s.id === PANGU_HUB_SOURCE_ID && s.accountBound)
    if (!account.loggedIn || !pangu?.enabled) return

    const baseUrl = pangu.registryUrl || account.hubBaseUrl || get().panguHubUrl
    const result = await hubMyNamespaces(baseUrl)

    if (!result.ok && result.unauthorized) {
      get().stopHubHeartbeat()
      set((s) => ({
        account: { loggedIn: false, hubBaseUrl: s.panguHubUrl },
        discoveredHub: null,
        sources: withoutPanguSources(s.sources),
        skills: withoutGuestPanguSkills(s.skills),
      }))
      get().showToast('盘古 Hub 会话已失效，源已断开', 'warning')
      get().persist()
      return
    }

    if (!result.ok) return

    const namespaces = result.namespaces || []
    if (!namespaces.length) {
      get().stopHubHeartbeat()
      set((s) => ({
        discoveredHub: null,
        sources: withoutPanguSources(s.sources),
        skills: withoutGuestPanguSkills(s.skills),
      }))
      get().showToast('已失去全部命名空间权限，盘古 Hub 已断开', 'warning')
      get().persist()
      return
    }

    const prevSlugs = new Set((pangu.namespaces || []).map((n) => n.slug))
    const nextSlugs = new Set(namespaces.map((n) => n.slug))
    const removed = [...prevSlugs].filter((slug) => !nextSlugs.has(slug))
    const changed =
      prevSlugs.size !== nextSlugs.size || [...nextSlugs].some((slug) => !prevSlugs.has(slug))

    set((s) => ({
      sources: s.sources.map((src) =>
        src.id === PANGU_HUB_SOURCE_ID
          ? { ...src, namespaces, authStatus: 'ok', status: 'connected' as SourceStatus }
          : src,
      ),
      discoveredHub: {
        baseUrl,
        name: PANGU_HUB_NAME,
        namespaces,
        connected: true,
      },
      skills:
        removed.length === 0
          ? s.skills
          : s.skills.filter(
              (skill) =>
                skill.sourceId !== PANGU_HUB_SOURCE_ID ||
                skill.installed ||
                skill.origin === 'created' ||
                skill.origin === 'imported' ||
                !removed.includes(skill.namespace || ''),
            ),
    }))

    if (changed) {
      get().persist()
      await get().refreshCatalog(PANGU_HUB_SOURCE_ID)
    }
  },

  persist: () => {
    const s = get()
    const sourcesToSave = s.account.loggedIn ? s.sources : withoutPanguSources(s.sources)
    const payload: PersistedUiState = {
      favorites: s.skills.filter((x) => x.favorite).map((x) => x.uid),
      installedUids: s.skills.filter((x) => x.installed).map((x) => x.uid),
      skillOverrides: Object.fromEntries(
        s.skills.map((skill) => [
          skill.uid,
          {
            version: skill.version,
            latestVersion: skill.latestVersion,
            updateAvailable: skill.updateAvailable,
            localPath: skill.localPath,
            origin: skill.origin,
          },
        ]),
      ),
      syncedAgents: Object.fromEntries(s.skills.map((skill) => [skill.uid, skill.syncedAgents])),
      sources: sourcesToSave,
      tasks: s.tasks.slice(0, 40),
      publishItems: s.publishItems,
      sidebarCollapsed: s.sidebarCollapsed,
      createdSkills: s.skills.filter((x) => x.origin === 'created' || x.origin === 'imported'),
      newSkillsFolder: s.newSkillsFolder,
      agentPathOverrides: s.agentPathOverrides,
      theme: s.theme,
      panguHubUrl: s.panguHubUrl,
      accountHint: {
        loggedIn: s.account.loggedIn,
        hubBaseUrl: s.account.hubBaseUrl,
        userId: s.account.userId,
        displayName: s.account.displayName,
        email: s.account.email,
      },
      defaultSyncAgentIds: s.defaultSyncAgentIds,
      lastCatalogSyncedAt: s.lastCatalogSyncedAt ?? undefined,
    }
    void savePersistedState(payload)
  },

  toggleSidebar: () => {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }))
    get().persist()
  },
  setDiscoverSearchQuery: (q) => set({ discoverSearchQuery: q }),
  setInstalledSearchQuery: (q) => set({ installedSearchQuery: q }),
  setDiscoverTab: (tab) => set({ discoverTab: tab }),
  setMineTab: (tab) => set({ mineTab: tab }),
  setSourceFilter: (id) => set({ sourceFilter: id }),
  isAgentSyncBusy: (skillUid, agentId) =>
    get().tasks.some(
      (t) =>
        t.skillUid === skillUid
        && t.agentId === agentId
        && (t.kind === 'sync' || t.kind === 'unsync')
        && (t.status === 'running' || t.status === 'pending'),
    ),
  setCategoryFilter: (c) => set({ categoryFilter: c }),
  setStatusFilter: (s) => set({ statusFilter: s }),
  setSortBy: (s) => set({ sortBy: s }),
  resetDiscoverFilters: () =>
    set({
      discoverSearchQuery: '',
      discoverTab: 'recommended',
      sourceFilter: 'all',
      categoryFilter: '全部',
      statusFilter: 'all',
      sortBy: 'recommended',
      batchMode: false,
      selectedUids: [],
    }),
  setBatchMode: (v) => set({ batchMode: v, selectedUids: v ? get().selectedUids : [] }),
  toggleSelected: (skillUid) =>
    set((s) => ({
      selectedUids: s.selectedUids.includes(skillUid)
        ? s.selectedUids.filter((x) => x !== skillUid)
        : [...s.selectedUids, skillUid],
    })),
  clearSelection: () => set({ selectedUids: [] }),
  installSelected: () => {
    const uids = get().selectedUids
    const targets = get().skills.filter((s) => uids.includes(s.uid) && !s.installed)
    if (!targets.length) {
      get().showToast('所选 Skill 均已安装或无可安装项', 'warning')
      return
    }
    targets.forEach((skill) => get().installSkill(skill.uid))
    get().showToast(`已开始批量安装 ${targets.length} 个 Skill`, 'info')
    set({ selectedUids: [], batchMode: false })
  },
  updateSelected: () => {
    const uids = get().selectedUids
    const targets = get().skills.filter((s) => uids.includes(s.uid) && s.updateAvailable)
    if (!targets.length) {
      get().showToast('所选 Skill 没有可更新项', 'warning')
      return
    }
    targets.forEach((skill) => get().updateSkill(skill.uid))
    get().showToast(`已开始批量更新 ${targets.length} 个 Skill`, 'info')
    set({ selectedUids: [], batchMode: false })
  },
  openSkill: (skillUid) => set({ selectedSkillUid: skillUid, drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleFavorite: (skillUid) => {
    set((s) => ({
      skills: s.skills.map((skill) => (skill.uid === skillUid ? { ...skill, favorite: !skill.favorite } : skill)),
    }))
    get().persist()
  },

  installSkill: (skillUid) => {
    const skill = get().skills.find((x) => x.uid === skillUid)
    if (!skill || skill.installed) return
    const meta = buildTaskMeta('install', { skill, phase: '正在下载并安装' })
    const task = createTask({
      ...meta,
      kind: 'install',
      status: 'running',
      skillUid,
      progress: 0,
    })
    set((s) => ({ tasks: [task, ...s.tasks] }))
    void runProgress(get, set, task.id, () => {
      void (async () => {
        const localPath = await ensureSkillPackageOnDisk(skill)
        set((s) => ({
          skills: s.skills.map((item) =>
            item.uid === skillUid
              ? {
                  ...item,
                  installed: true,
                  updateAvailable: false,
                  version: item.latestVersion || item.version,
                  localPath,
                }
              : item,
          ),
          tasks: s.tasks.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  ...buildTaskMeta('install', { skill, phase: '安装完成' }),
                  status: 'success',
                  progress: 100,
                  updatedAt: new Date().toISOString(),
                }
              : t,
          ),
        }))
        const linked = await applyDefaultAgentSync(get, set, skillUid)
        const linkNote = linked.length ? `，已同步到 ${linked.join('、')}` : ''
        get().pushNotification(`${skill.name} 安装完成${linkNote}`, task.id, 'success')
        get().persist()
      })()
    })
  },

  updateSkill: (skillUid) => {
    const skill = get().skills.find((x) => x.uid === skillUid)
    if (!skill || !skill.updateAvailable) return
    const meta = buildTaskMeta('update', { skill, phase: '正在下载更新包' })
    const task = createTask({
      ...meta,
      kind: 'update',
      status: 'running',
      skillUid,
      progress: 0,
    })
    set((s) => ({ tasks: [task, ...s.tasks] }))
    void runProgress(get, set, task.id, () => {
      void (async () => {
        const nextVersion = skill.latestVersion || skill.version
        const nextSkill = { ...skill, version: nextVersion, updateAvailable: false }
        const localPath = await ensureSkillPackageOnDisk(nextSkill)
        set((s) => ({
          skills: s.skills.map((item) =>
            item.uid === skillUid
              ? {
                  ...item,
                  version: nextVersion,
                  updateAvailable: false,
                  localPath,
                }
              : item,
          ),
        }))
        await resyncSkillToAgents(get, skillUid)
        const linked = await applyDefaultAgentSync(get, set, skillUid)
        const syncedCount = get().skills.find((s) => s.uid === skillUid)?.syncedAgents.length || 0
        const linkNote = linked.length ? `，新增同步到 ${linked.join('、')}` : ''
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  ...buildTaskMeta('update', {
                    skill: { ...nextSkill, localPath },
                    phase:
                      syncedCount > 0
                        ? `更新完成，已同步到 ${syncedCount} 个智能体`
                        : '更新完成',
                  }),
                  status: 'success',
                  progress: 100,
                  updatedAt: new Date().toISOString(),
                }
              : t,
          ),
        }))
        get().pushNotification(`${skill.name} 已更新到 v${nextVersion}${linkNote}`, task.id, 'success')
        get().persist()
      })()
    })
  },

  updateAll: () => {
    const targets = get().skills.filter((s) => s.updateAvailable)
    if (!targets.length) {
      get().showToast('当前没有可更新的 Skill', 'info')
      return
    }
    void (async () => {
      const ok = await confirmDialog({
        title: '全部更新',
        message: `确定更新 ${targets.length} 个 Skill 吗？`,
        detail: '将下载最新版本并覆盖本地已安装包。',
      })
      if (!ok) return
      targets.forEach((skill) => get().updateSkill(skill.uid))
      get().showToast(`已开始更新 ${targets.length} 个 Skill`, 'info')
    })()
  },

  deleteSkill: async (skillUid) => {
    const skill = get().skills.find((x) => x.uid === skillUid)
    if (!skill?.installed) return
    if (skill.syncedAgents.length > 0) {
      get().showToast('请先取消所有「同步到智能体」后再删除', 'warning')
      return
    }
    const ok = await confirmDialog({
      title: '删除本地 Skill',
      message: `确定删除「${skill.name}」吗？`,
      detail: '将移除本地仓库中的 Skill 包；发现列表中的条目仍会保留为未安装状态。',
    })
    if (!ok) return
    const meta = buildTaskMeta('delete', { skill, phase: '正在删除本地包' })
    const task = createTask({
      ...meta,
      kind: 'delete',
      status: 'running',
      skillUid,
      progress: 0,
    })
    set((s) => ({ tasks: [task, ...s.tasks] }))
    void runProgress(get, set, task.id, () => {
      void (async () => {
        if (skill.localPath) {
          await window.skillMesh?.skills.removePackage(skill.localPath)
        }
        set((s) => ({
          skills: s.skills.map((item) =>
            item.uid === skillUid
              ? { ...item, installed: false, updateAvailable: false, syncedAgents: [], localPath: undefined }
              : item,
          ),
          tasks: s.tasks.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  ...buildTaskMeta('delete', { skill, phase: '已删除' }),
                  status: 'success',
                  progress: 100,
                  updatedAt: new Date().toISOString(),
                }
              : t,
          ),
          drawerOpen: s.selectedSkillUid === skillUid ? false : s.drawerOpen,
        }))
        get().pushNotification(`${skill.name} 已从本地删除`, task.id, 'success')
        get().persist()
      })()
    })
  },

  toggleAgentSync: (skillUid, agentId) => {
    void (async () => {
      const skill = get().skills.find((x) => x.uid === skillUid)
      const agent = get().agents.find((x) => x.id === agentId)
      if (!skill?.installed || !agent?.installed || !agent.skillPath) return
      const enabling = !skill.syncedAgents.includes(agentId)

      if (!enabling) {
        const confirmed = window.skillMesh?.dialog.confirm
          ? await window.skillMesh.dialog.confirm({
              title: '取消智能体同步',
              message: `确定从「${agent.name}」中移除 Skill「${skill.name}」吗？`,
              detail: '将删除该智能体本地目录中的 Skill 包。Nexus 本地仓库中的副本不会删除。',
            })
          : window.confirm(`确定从「${agent.name}」中移除 Skill「${skill.name}」吗？\n将删除该智能体本地目录中的 Skill 包。`)
        if (!confirmed) return
      }

      const kind: TaskKind = enabling ? 'sync' : 'unsync'
      const phase = enabling ? '正在写入智能体目录' : '正在从智能体目录删除'
      const meta = buildTaskMeta(kind, { skill, agent, phase })
      const task = createTask({
        ...meta,
        kind,
        status: 'running',
        skillUid,
        agentId,
        progress: 0,
      })
      set((s) => ({ tasks: [task, ...s.tasks] }))

      void runProgress(get, set, task.id, () => {
        void (async () => {
          if (!skill.localPath) {
            const localPath = await ensureSkillPackageOnDisk(skill)
            set((s) => ({
              skills: s.skills.map((item) => (item.uid === skillUid ? { ...item, localPath } : item)),
            }))
            skill.localPath = localPath
          }

          const syncResult = await syncSkillToAgent(skill, agent, enabling ? 'link' : 'unlink')
          if (!syncResult?.ok) {
            set((s) => ({
              tasks: s.tasks.map((t) =>
                t.id === task.id
                  ? {
                      ...t,
                      status: 'failed',
                      error: syncResult?.error || (enabling ? '同步到智能体失败' : '取消智能体同步失败'),
                      updatedAt: new Date().toISOString(),
                    }
                  : t,
              ),
            }))
            get().persist()
            return
          }

          set((s) => ({
            skills: s.skills.map((item) => {
              if (item.uid !== skillUid) return item
              const syncedAgents = enabling
                ? Array.from(new Set([...item.syncedAgents, agentId]))
                : item.syncedAgents.filter((id) => id !== agentId)
              return {
                ...item,
                syncedAgents,
                lastSyncedAt: enabling ? new Date().toISOString() : item.lastSyncedAt,
              }
            }),
            tasks: s.tasks.map((t) =>
              t.id === task.id
                ? {
                    ...t,
                    ...buildTaskMeta(kind, {
                      skill,
                      agent,
                      phase: enabling ? '已同步到智能体' : '已从智能体目录移除',
                    }),
                    status: 'success',
                    progress: 100,
                    updatedAt: new Date().toISOString(),
                  }
                : t,
            ),
          }))
          get().pushNotification(
            enabling
              ? `${skill.name} 已同步到智能体 ${agent.name}`
              : `${skill.name} 已从智能体 ${agent.name} 取消同步`,
            task.id,
            'success',
          )
          get().persist()
        })()
      })
    })()
  },

  createSkill: ({ name, description, content }) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const skillId = uid('created').replace(/^created_/, '')
    const folder = get().newSkillsFolder.replace(/\/$/, '')
    const md = content.trim() || `# ${trimmed}\n\n${description?.trim() || '用户新建的 Skill'}\n`
    const skill: Skill = {
      uid: `created:user:${skillId}`,
      sourceId: 'local',
      sourceName: '新建',
      namespace: 'user',
      skillId,
      name: trimmed,
      description: description?.trim() || '用户新建的 Skill',
      version: '0.1.0',
      latestVersion: '0.1.0',
      author: '本地用户',
      tags: ['新建'],
      category: '办公效率',
      sizeLabel: '0.5 MB',
      license: 'MIT',
      updatedAt: new Date().toISOString().slice(0, 10),
      installed: true,
      updateAvailable: false,
      favorite: false,
      downloads: 0,
      syncedAgents: [],
      origin: 'created',
      localPath: `${folder}/${skillId}`,
      content: md,
    }
    const meta = buildTaskMeta('create', { skill, phase: '正在创建 Skill', sourceName: '新建' })
    const task = createTask({
      ...meta,
      kind: 'create',
      status: 'running',
      skillUid: skill.uid,
      progress: 0,
    })
    set((s) => ({ tasks: [task, ...s.tasks] }))
    void runProgress(get, set, task.id, () => {
      void (async () => {
        const localPath = (await ensureSkillPackageOnDisk(skill)) || skill.localPath
        skill.localPath = localPath
        set((s) => ({
          skills: [skill, ...s.skills],
          tasks: s.tasks.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  ...buildTaskMeta('create', { skill, phase: '创建完成', sourceName: '新建' }),
                  status: 'success',
                  progress: 100,
                  updatedAt: new Date().toISOString(),
                }
              : t,
          ),
          selectedSkillUid: skill.uid,
          drawerOpen: true,
        }))
        get().pushNotification(`已新建 ${skill.name}`, task.id)
        get().persist()
      })()
    })
  },

  setNewSkillsFolder: (folder) => {
    set({ newSkillsFolder: folder || DEFAULT_NEW_SKILLS_FOLDER })
    get().persist()
  },

  importLocalSkill: (filePath) => {
    if (!filePath) {
      get().showToast('请重新选择本地 Skill 包', 'warning')
      return
    }
    const name = filePath.split(/[/\\]/).pop() || '本地 Skill'
    const meta = buildTaskMeta('import', { phase: '正在校验并解析', sourceName: '本地' })
    const task = createTask({
      ...meta,
      title: `导入 · ${name.replace(/\.(zip|skillpack|tar\.gz|tgz)$/i, '')}`,
      kind: 'import',
      status: 'running',
      progress: 0,
      filePath,
    })
    set((s) => ({ tasks: [task, ...s.tasks] }))
    void runProgress(get, set, task.id, () => {
      void (async () => {
        const skillId = uid('imported')
        const skillName = name.replace(/\.(zip|skillpack|tar\.gz|tgz)$/i, '')
        const skill: Skill = {
          uid: `local:user:${skillId}`,
          sourceId: 'local',
          sourceName: '本地',
          namespace: 'user',
          skillId,
          name: skillName,
          description: '从本地导入的 Skill 包，已加入本地 Skill Repository。',
          version: '0.1.0',
          latestVersion: '0.1.0',
          author: '本地用户',
          tags: ['本地导入'],
          category: '办公效率',
          sizeLabel: '2.0 MB',
          license: 'MIT',
          updatedAt: new Date().toISOString().slice(0, 10),
          installed: true,
          updateAvailable: false,
          favorite: false,
          downloads: 0,
          syncedAgents: [],
          localPath: filePath || undefined,
          origin: 'imported',
        }
        const localPath = await ensureSkillPackageOnDisk(skill)
        skill.localPath = localPath || skill.localPath
        set((s) => ({
          skills: [skill, ...s.skills],
          tasks: s.tasks.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  ...buildTaskMeta('import', { skill, phase: '导入完成' }),
                  status: 'success',
                  progress: 100,
                  skillUid: skill.uid,
                  filePath,
                  updatedAt: new Date().toISOString(),
                }
              : t,
          ),
          selectedSkillUid: skill.uid,
          drawerOpen: true,
        }))
        get().pushNotification(`已导入 ${skill.name}`, task.id, 'success')
        get().persist()
      })()
    })
  },

  retryTask: (taskId) => {
    const task = get().tasks.find((t) => t.id === taskId)
    if (!task || task.status !== 'failed') return
    if (task.kind === 'install' && task.skillUid) get().installSkill(task.skillUid)
    if (task.kind === 'update' && task.skillUid) get().updateSkill(task.skillUid)
    if ((task.kind === 'sync' || task.kind === 'unsync') && task.skillUid && task.agentId) {
      get().toggleAgentSync(task.skillUid, task.agentId)
    }
    if (task.kind === 'import') {
      if (task.filePath) get().importLocalSkill(task.filePath)
      else get().showToast('原导入路径已丢失，请重新选择本地 Skill 包', 'warning')
    }
  },

  cancelTask: (taskId) => {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId && (t.status === 'running' || t.status === 'pending')
          ? { ...t, status: 'cancelled', updatedAt: new Date().toISOString() }
          : t,
      ),
    }))
    get().persist()
  },

  addSource: (source) => {
    const item: SkillSource = {
      id: source.id || uid('source'),
      name: source.name,
      type: source.type,
      registryUrl: source.registryUrl,
      token: source.token,
      enabled: source.enabled,
      status: 'checking',
      accountBound: source.accountBound,
      namespaces: source.namespaces,
      authStatus: source.authStatus,
    }
    set((s) => ({ sources: [...s.sources, item] }))
    void get().testSource(item.id)
    get().persist()
  },

  updateSource: (id, patch) => {
    set((s) => ({ sources: s.sources.map((item) => (item.id === id ? { ...item, ...patch } : item)) }))
    get().persist()
  },

  removeSource: async (id) => {
    if (id === 'local') return
    const source = get().sources.find((s) => s.id === id)
    if (!source) return
    const catalogCount = get().skills.filter(
      (s) => s.sourceId === id && !s.installed && s.origin !== 'created' && s.origin !== 'imported',
    ).length
    const ok = await confirmDialog({
      title: '删除技能源',
      message: `确定删除「${source.name}」吗？`,
      detail: `将移除该源，并清理 ${catalogCount} 个未安装的列表项；已安装的 Skill 会保留在本地。`,
    })
    if (!ok) return
    set((s) => ({
      sources: s.sources.filter((item) => item.id !== id),
      skills: s.skills.filter(
        (skill) =>
          skill.sourceId !== id ||
          skill.installed ||
          skill.origin === 'created' ||
          skill.origin === 'imported',
      ),
    }))
    get().showToast(`已删除技能源「${source.name}」`, 'success')
    get().persist()
  },

  testSource: async (id) => {
    if (get().catalogSyncing) {
      get().showToast('列表刷新进行中，请稍候再测试连接', 'info')
      return
    }
    const source = get().sources.find((s) => s.id === id)
    if (!source) return
    set((s) => ({
      sources: s.sources.map((item) => (item.id === id ? { ...item, status: 'checking' } : item)),
    }))
    if (source.type === 'offline') {
      set((s) => ({
        sources: s.sources.map((item) => (item.id === id ? { ...item, status: 'connected' } : item)),
      }))
      get().persist()
      return
    }
    if (!source.registryUrl) {
      set((s) => ({
        sources: s.sources.map((item) => (item.id === id ? { ...item, status: 'disconnected' } : item)),
      }))
      get().pushNotification('请先填写技能源 API 地址', undefined, 'warning')
      get().persist()
      return
    }
    const result = await testSourceConnection({
      registryUrl: source.registryUrl,
      token: source.token,
      type: source.type,
    })
    set((s) => ({
      sources: s.sources.map((item) =>
        item.id === id ? { ...item, status: result.ok ? 'connected' : 'disconnected' } : item,
      ),
    }))
    get().pushNotification(
      result.ok ? `${source.name} 已连接` : `${source.name} 连接失败：${result.message || ''}`,
      undefined,
      result.ok ? 'success' : 'error',
    )
    if (result.ok) {
      await get().refreshCatalog(id)
    }
    get().persist()
  },

  ensureCatalogFresh: async () => {
    // Drop stale Pangu Hub left from a previous login while currently a guest
    if (!get().account.loggedIn && get().sources.some(isPanguSource)) {
      set((s) => ({
        sources: withoutPanguSources(s.sources),
        skills: withoutGuestPanguSkills(s.skills),
        discoveredHub: null,
      }))
      get().persist()
    }
    if (get().catalogSyncing) {
      return { ok: true, message: '列表刷新进行中', skipped: true }
    }
    const last = get().lastCatalogSyncedAt
    // First launch: do not auto-pull — user must click「刷新列表」
    if (!last) {
      const message = '首次启动需手动刷新列表'
      set({ catalogSyncMessage: message })
      return { ok: true, message, skipped: true }
    }
    const age = Date.now() - new Date(last).getTime()
    if (!Number.isNaN(age) && age < CATALOG_STALE_MS) {
      const message = `列表仍新鲜 · 上次刷新 ${formatSyncTime(last)}`
      set({ catalogSyncMessage: message })
      return { ok: true, message, skipped: true }
    }
    return get().refreshCatalog({ silent: true, force: true })
  },

  retryFailedSources: async () => {
    if (get().catalogSyncing) {
      get().showToast('列表刷新进行中，请稍候', 'info')
      return { ok: false, message: '列表刷新进行中，请稍候', skipped: true }
    }
    const failedIds = get()
      .sources.filter((s) => s.enabled && s.type !== 'offline' && !!s.registryUrl && !!s.lastSyncError)
      .map((s) => s.id)
    if (!failedIds.length) {
      const message = '没有失败的技能源需要重试'
      get().showToast(message, 'info')
      return { ok: true, message }
    }
    // Refresh each failed source sequentially via force refresh of that id
    let okCount = 0
    for (const id of failedIds) {
      const result = await get().refreshCatalog({ sourceId: id, force: true, silent: true })
      if (result.ok) okCount += 1
    }
    const message =
      okCount === failedIds.length
        ? `已重新刷新 ${okCount} 个失败源`
        : `重试完成：${okCount}/${failedIds.length} 个源成功`
    get().showToast(message, okCount ? 'success' : 'error')
    return { ok: okCount > 0, message }
  },

  setDefaultSyncAgentIds: (ids) => {
    set({ defaultSyncAgentIds: Array.from(new Set(ids)) })
    get().persist()
  },

  toggleDefaultSyncAgent: (agentId) => {
    set((s) => {
      const has = s.defaultSyncAgentIds.includes(agentId)
      return {
        defaultSyncAgentIds: has
          ? s.defaultSyncAgentIds.filter((id) => id !== agentId)
          : [...s.defaultSyncAgentIds, agentId],
      }
    })
    get().persist()
  },

  refreshCatalog: async (options) => {
    const { sourceId, silent } = normalizeRefreshOptions(options)
    if (get().catalogSyncing) {
      const message = '列表刷新进行中，请稍候'
      if (!silent) get().showToast(message, 'info')
      return { ok: false, message, skipped: true }
    }

    const loggedIn = get().account.loggedIn
    const targets = get().sources.filter(
      (s) =>
        s.enabled &&
        s.type !== 'offline' &&
        !!s.registryUrl &&
        (!sourceId || s.id === sourceId) &&
        // Account-bound Pangu Hub must not refresh (or appear "connected") while logged out
        (!isPanguSource(s) || loggedIn),
    )

    if (!targets.length) {
      const message = '没有可刷新的技能源，请先添加并启用至少一个源'
      set({ catalogSyncMessage: message })
      if (!silent) get().showToast(message, 'warning')
      return { ok: false, message }
    }

    set({
      catalogSyncing: true,
      catalogSyncMessage: silent ? '正在后台刷新列表…' : '正在刷新技能列表…',
    })

    const remoteBySource = new Map<string, Skill[]>()
    const statusUpdates = new Map<string, SourceStatus>()
    const syncMeta = new Map<string, { lastSyncedAt?: string; lastSyncError?: string }>()
    const notes: string[] = []
    const nowIso = new Date().toISOString()

    try {
      for (const source of targets) {
        try {
          const useSession = !!(source.accountBound && source.namespaces?.length && get().account.loggedIn)
          const result = await listSkillsFromSource({
            registryUrl: source.registryUrl,
            token: source.token,
            sourceId: source.id,
            sourceName: source.name,
            type: source.type,
            query: '',
            limit: source.type === 'clawhub' ? 50 : 200,
            useSession,
            namespaces: useSession ? source.namespaces : undefined,
          })
          if (result.ok) {
            remoteBySource.set(source.id, result.skills || [])
            statusUpdates.set(source.id, 'connected')
            syncMeta.set(source.id, { lastSyncedAt: nowIso, lastSyncError: undefined })
            notes.push(`${source.name}: ${result.skills?.length ?? 0}`)
          } else {
            statusUpdates.set(source.id, 'disconnected')
            syncMeta.set(source.id, { lastSyncError: result.message || '刷新失败' })
            notes.push(`${source.name}: ${result.message || '失败'}`)
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : '失败'
          statusUpdates.set(source.id, 'disconnected')
          syncMeta.set(source.id, { lastSyncError: msg })
          notes.push(`${source.name}: ${msg}`)
        }
      }

      set((s) => {
        const prevByKey = new Map<string, Skill>()
        for (const skill of s.skills) {
          prevByKey.set(skill.uid, skill)
          prevByKey.set(`${skill.sourceId}:${skill.namespace || 'global'}/${skill.skillId}`, skill)
        }

        const localOwned = s.skills.filter((skill) => skill.origin === 'created' || skill.origin === 'imported')
        const syncedSourceIds = new Set(remoteBySource.keys())

        const retainedInstalled = s.skills.filter(
          (skill) =>
            skill.installed &&
            skill.origin !== 'created' &&
            skill.origin !== 'imported' &&
            !syncedSourceIds.has(skill.sourceId),
        )

        const keepUnsyncedCatalog = sourceId
          ? s.skills.filter(
              (skill) =>
                skill.origin !== 'created' &&
                skill.origin !== 'imported' &&
                !skill.installed &&
                skill.sourceId !== sourceId &&
                !syncedSourceIds.has(skill.sourceId),
            )
          : []

        const mergedRemote: Skill[] = []
        for (const [, skills] of remoteBySource) {
          for (const remote of skills) {
            const prev =
              prevByKey.get(remote.uid) ||
              prevByKey.get(`${remote.sourceId}:${remote.namespace || 'global'}/${remote.skillId}`)
            const installed = prev?.installed ?? false
            const version = installed && prev?.version ? prev.version : remote.version
            const latestVersion = remote.latestVersion || remote.version
            mergedRemote.push({
              ...remote,
              installed,
              favorite: prev?.favorite ?? false,
              syncedAgents: prev?.syncedAgents ?? [],
              lastSyncedAt: prev?.lastSyncedAt,
              localPath: prev?.localPath,
              content: prev?.content,
              version,
              latestVersion,
              updateAvailable: installed && !!latestVersion && version !== latestVersion,
            })
          }
        }

        const byUid = new Map<string, Skill>()
        for (const skill of [...localOwned, ...retainedInstalled, ...keepUnsyncedCatalog, ...mergedRemote]) {
          byUid.set(skill.uid, skill)
        }

        return {
          skills: Array.from(byUid.values()),
          sources: s.sources.map((item) => {
            if (!statusUpdates.has(item.id) && !syncMeta.has(item.id)) return item
            const meta = syncMeta.get(item.id)
            return {
              ...item,
              status: statusUpdates.get(item.id) ?? item.status,
              lastSyncedAt: meta?.lastSyncedAt ?? item.lastSyncedAt,
              lastSyncError: meta?.lastSyncError,
            }
          }),
        }
      })

      const ok = remoteBySource.size > 0
      const totalSkills = Array.from(remoteBySource.values()).reduce((n, list) => n + list.length, 0)
      const failed = targets.length - remoteBySource.size
      const message = ok
        ? `已刷新 ${remoteBySource.size} 个源，共 ${totalSkills} 个 Skill${failed ? `（${failed} 个失败）` : ''}`
        : `列表刷新失败（${notes.join('，')}）`
      set({
        catalogSyncing: false,
        catalogSyncMessage: message,
        lastCatalogSyncedAt: ok ? nowIso : get().lastCatalogSyncedAt,
      })
      if (!silent) {
        get().showToast(message, ok ? 'success' : 'error')
      } else if (!ok) {
        get().showToast(message, 'error')
      }
      get().persist()
      return { ok, message }
    } catch (error) {
      const message = error instanceof Error ? error.message : '列表刷新失败'
      set({ catalogSyncing: false, catalogSyncMessage: message })
      get().showToast(message, 'error')
      return { ok: false, message }
    }
  },

  applyAgentPathOverrides: (agents) => {
    const overrides = get().agentPathOverrides
    return agents.map((agent) => {
      const defaultSkillPath = agent.defaultSkillPath || agent.skillPath
      const override = overrides[agent.id]
      return {
        ...agent,
        defaultSkillPath,
        skillPath: override || defaultSkillPath,
      }
    })
  },

  scanAgents: async () => {
    if (window.skillMesh?.agents?.scan) {
      const agents = await window.skillMesh.agents.scan()
      set({ agents: get().applyAgentPathOverrides(agents) })
      return
    }
    await new Promise((r) => setTimeout(r, 500))
    set({
      agents: get().applyAgentPathOverrides(
        DEFAULT_AGENTS.map((a) => ({ ...a, lastDetectedAt: new Date().toISOString() })),
      ),
    })
  },

  setAgents: (agents) => set({ agents: get().applyAgentPathOverrides(agents) }),

  saveAgentPathOverrides: async (overrides) => {
    set({ agentPathOverrides: overrides, restartRequired: true })
    get().persist()
    const choice = window.skillMesh?.dialog.restartPrompt
      ? await window.skillMesh.dialog.restartPrompt({
          title: '路径已修改',
          message: '智能体 Skill 路径已保存，重启后生效。',
          detail: '可选择立即重启，或稍后手动重启应用。',
        })
      : window.confirm('智能体路径已保存，是否立即重启？')
        ? 'relaunch'
        : 'later'
    if (choice === 'relaunch') {
      await window.skillMesh?.app?.relaunch()
    }
    return choice
  },

  submitPublish: async ({ skillUid, namespace, visibility, version, confirmWarnings }) => {
    if (!get().account.loggedIn) {
      get().showToast('游客不能发布，请先登录', 'warning')
      set({ loginOpen: true })
      return { ok: false, message: '未登录' }
    }
    const skill = get().skills.find((s) => s.uid === skillUid)
    const source = get().sources.find((s) => s.id === PANGU_HUB_SOURCE_ID && s.accountBound)
    if (!skill) {
      get().showToast('未找到可发布的 Skill', 'warning')
      return { ok: false, message: 'Skill 不存在' }
    }
    if (skill.origin !== 'created' && skill.origin !== 'imported') {
      get().showToast('仅支持发布新建或本地导入的 Skill', 'warning')
      return { ok: false, message: '类型不支持' }
    }
    if (!source || !source.enabled || source.authStatus === 'lost') {
      get().showToast('请先登录并一键连接盘古 Hub', 'warning')
      return { ok: false, message: '企业源未连接' }
    }
    if (!namespace) {
      get().showToast('请选择命名空间', 'warning')
      return { ok: false, message: '缺少命名空间' }
    }
    if (!window.skillMesh?.skills?.packZip || !window.skillMesh?.hub?.publish) {
      get().showToast('当前环境不支持发布（需桌面客户端）', 'error')
      return { ok: false, message: '无 IPC' }
    }

    const baseUrl = source.registryUrl || get().account.hubBaseUrl || get().panguHubUrl
    const targetLabel = `${PANGU_HUB_NAME} / @${namespace}`
    const publishVersion = version || skill.version || '1.0.0'
    const meta = buildTaskMeta('publish', {
      skill,
      sourceName: targetLabel,
      phase: `正在打包并发布到 ${targetLabel}`,
    })
    const task = createTask({
      ...meta,
      kind: 'publish',
      status: 'running',
      skillUid,
      progress: 10,
    })
    set((s) => ({ tasks: [task, ...s.tasks] }))

    try {
      const packed = await window.skillMesh.skills.packZip({
        skill: {
          skillId: skill.skillId,
          name: skill.name,
          description: skill.description,
          version: publishVersion,
          sourceId: skill.sourceId,
          sourceName: skill.sourceName,
          namespace: skill.namespace,
          localPath: skill.localPath,
          content: skill.content,
        },
        version: publishVersion,
      })
      if (!packed.ok || !packed.zipPath) {
        const message = packed.error || '打包失败'
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  status: 'failed',
                  progress: 100,
                  error: message,
                  updatedAt: new Date().toISOString(),
                }
              : t,
          ),
        }))
        get().showToast(message, 'error')
        get().persist()
        return { ok: false, message }
      }

      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === task.id ? { ...t, progress: 55, subtitle: '正在上传到盘古 Hub…' } : t,
        ),
      }))

      const result = await window.skillMesh.hub.publish({
        baseUrl,
        namespace,
        visibility,
        zipPath: packed.zipPath,
        confirmWarnings: !!confirmWarnings,
        tmpDir: packed.tmpDir,
      })

      if (!result.ok) {
        if (result.confirmRequired) {
          set((s) => ({
            tasks: s.tasks.map((t) =>
              t.id === task.id
                ? {
                    ...t,
                    status: 'cancelled',
                    progress: 100,
                    error: result.message,
                    updatedAt: new Date().toISOString(),
                  }
                : t,
            ),
          }))
          get().persist()
          return { ok: false, message: result.message, confirmRequired: true }
        }
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  status: 'failed',
                  progress: 100,
                  error: result.message,
                  updatedAt: new Date().toISOString(),
                }
              : t,
          ),
        }))
        get().showToast(result.message || '发布失败', 'error')
        get().persist()
        return { ok: false, message: result.message }
      }

      // PRIVATE skips namespace review — SkillHub keeps UPLOADED; never show as 审核中
      const remoteStatus =
        visibility === 'PRIVATE'
          ? 'uploaded'
          : mapRemotePublishStatus(result.result?.status)
      const item: PublishItem = {
        id: uid('pub'),
        skillUid,
        name: skill.name,
        version: result.result?.version || packed.version || publishVersion,
        sourceName: targetLabel,
        namespace: result.result?.namespace || namespace,
        slug: result.result?.slug,
        remoteSkillId: result.result?.skillId,
        visibility,
        status: remoteStatus,
        createdAt: new Date().toISOString(),
      }
      const phase =
        visibility === 'PRIVATE'
          ? '已上传（私人，无需审核）'
          : remoteStatus === 'published'
            ? '已发布'
            : remoteStatus === 'uploaded'
              ? '已上传'
              : '已提交审核'
      set((s) => ({
        publishItems: [item, ...s.publishItems.filter((p) => p.id !== item.id)],
        skills: s.skills.map((sk) =>
          sk.uid === skillUid
            ? { ...sk, version: item.version, latestVersion: item.version }
            : sk,
        ),
        tasks: s.tasks.map((t) =>
          t.id === task.id
            ? {
                ...t,
                ...buildTaskMeta('publish', { skill, sourceName: targetLabel, phase }),
                status: 'success',
                progress: 100,
                updatedAt: new Date().toISOString(),
              }
            : t,
        ),
      }))
      get().pushNotification(`${skill.name} ${phase}`, task.id)
      get().showToast(
        visibility === 'PRIVATE'
          ? `${skill.name} 已上传：私人 Skill 无需审核，其他人不可见`
          : remoteStatus === 'published'
            ? `${skill.name} 已发布`
            : remoteStatus === 'uploaded'
              ? `${skill.name} 已上传`
              : `${skill.name} 已提交审核`,
        'success',
      )
      get().persist()
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : '发布失败'
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: 'failed',
                progress: 100,
                error: message,
                updatedAt: new Date().toISOString(),
              }
            : t,
        ),
      }))
      get().showToast(message, 'error')
      get().persist()
      return { ok: false, message }
    }
  },

  withdrawPublishReview: async (publishId) => {
    if (!get().account.loggedIn) {
      get().showToast('请先登录', 'warning')
      return { ok: false, message: '未登录' }
    }
    const item = get().publishItems.find((p) => p.id === publishId)
    if (!item?.namespace || !item.slug || !item.version) {
      get().showToast('缺少远程发布信息，无法撤回', 'warning')
      return { ok: false, message: '信息不完整' }
    }
    if (item.status !== 'reviewing') {
      get().showToast('仅审核中的发布可撤回', 'info')
      return { ok: false, message: '状态不允许' }
    }
    const baseUrl =
      get().sources.find((s) => s.id === PANGU_HUB_SOURCE_ID)?.registryUrl ||
      get().account.hubBaseUrl ||
      get().panguHubUrl
    if (!window.skillMesh?.hub?.withdrawReview) {
      get().showToast('当前环境不支持撤回', 'error')
      return { ok: false, message: '无 IPC' }
    }
    const result = await window.skillMesh.hub.withdrawReview({
      baseUrl,
      namespace: item.namespace,
      slug: item.slug,
      version: item.version,
    })
    if (!result.ok) {
      get().showToast(result.message || '撤回失败', 'error')
      return result
    }
    set((s) => ({
      publishItems: s.publishItems.map((p) =>
        p.id === publishId ? { ...p, status: 'withdrawn' as PublishStatus } : p,
      ),
    }))
    get().showToast(`已撤回 ${item.name}@${item.version} 的审核`, 'success')
    get().persist()
    return { ok: true }
  },

  refreshPublishStatuses: async (options) => {
    const silent = options?.silent !== false
    if (!get().account.loggedIn) {
      return { ok: false, updated: 0, message: '未登录' }
    }
    if (!window.skillMesh?.hub?.getSkillVersionStatus) {
      return { ok: false, updated: 0, message: '当前环境不支持状态同步' }
    }

    // Fix historical PRIVATE items mistakenly marked as reviewing
    const prevItems = get().publishItems
    let nextItems = prevItems.map((p) =>
      p.visibility === 'PRIVATE' && p.status === 'reviewing'
        ? { ...p, status: 'uploaded' as PublishStatus }
        : p,
    )
    let updated = nextItems.reduce(
      (n, p, i) => n + (p.status !== prevItems[i].status ? 1 : 0),
      0,
    )

    const pending = nextItems.filter(
      (item) =>
        !!item.namespace &&
        !!item.slug &&
        !!item.version &&
        item.visibility !== 'PRIVATE' &&
        (item.status === 'reviewing' || item.status === 'uploaded' || item.status === 'rejected'),
    )
    if (!pending.length) {
      if (updated > 0) {
        set({ publishItems: nextItems })
        get().persist()
      }
      return { ok: true, updated, message: updated ? '已校正私人 Skill 状态' : '无需同步' }
    }

    const baseUrl =
      get().sources.find((s) => s.id === PANGU_HUB_SOURCE_ID)?.registryUrl ||
      get().account.hubBaseUrl ||
      get().panguHubUrl

    const notifications: string[] = []
    nextItems = [...nextItems]

    for (const item of pending) {
      const result = await window.skillMesh.hub.getSkillVersionStatus({
        baseUrl,
        namespace: item.namespace!,
        slug: item.slug!,
        version: item.version,
      })
      if (!result.ok || !result.status) continue
      const nextStatus = mapRemotePublishStatus(result.status)
      if (nextStatus === item.status) {
        // Still allow attaching reject reason
        if (result.reviewComment && item.status === 'rejected' && item.reason !== result.reviewComment) {
          const idx = nextItems.findIndex((p) => p.id === item.id)
          if (idx >= 0) {
            nextItems[idx] = { ...nextItems[idx], reason: result.reviewComment }
            updated += 1
          }
        }
        continue
      }
      const idx = nextItems.findIndex((p) => p.id === item.id)
      if (idx < 0) continue
      nextItems[idx] = {
        ...nextItems[idx],
        status: nextStatus,
        reason: nextStatus === 'rejected' ? result.reviewComment || nextItems[idx].reason : undefined,
      }
      updated += 1
      if (item.status === 'reviewing' && nextStatus === 'published') {
        notifications.push(`${item.name}@${item.version} 已审核通过`)
      } else if (item.status === 'reviewing' && nextStatus === 'rejected') {
        notifications.push(`${item.name}@${item.version} 审核未通过`)
      } else if (item.status === 'reviewing' && nextStatus === 'uploaded') {
        notifications.push(`${item.name}@${item.version} 已撤回至已上传`)
      } else if (item.status === 'uploaded' && nextStatus === 'published') {
        notifications.push(`${item.name}@${item.version} 已发布`)
      }
    }

    if (updated > 0) {
      set({ publishItems: nextItems })
      get().persist()
      for (const msg of notifications) {
        get().pushNotification(msg)
      }
      // Auto-sync: still toast when review outcome changes so the list update is obvious
      if (silent && notifications.length) {
        get().showToast(notifications[0], 'success')
      }
    }
    const message = updated ? `已更新 ${updated} 条发布状态` : '状态无变化'
    if (!silent) {
      get().showToast(notifications[0] || message, updated ? 'success' : 'info')
    }
    return { ok: true, updated, message }
  },

  deletePublishedSkill: async (publishId) => {
    if (!get().account.loggedIn) {
      get().showToast('请先登录', 'warning')
      return { ok: false, message: '未登录' }
    }
    const item = get().publishItems.find((p) => p.id === publishId)
    if (!item?.namespace || !item.slug) {
      get().showToast('缺少远程发布信息，无法删除', 'warning')
      return { ok: false, message: '信息不完整' }
    }
    const confirmed = await confirmDialog({
      title: '删除远端 Skill',
      message: `确定删除 ${item.namespace}/${item.slug} 吗？`,
      detail: '将从盘古 Hub 删除该 Skill（不可恢复）。',
    })
    if (!confirmed) return { ok: false, message: '已取消' }

    const baseUrl =
      get().sources.find((s) => s.id === PANGU_HUB_SOURCE_ID)?.registryUrl ||
      get().account.hubBaseUrl ||
      get().panguHubUrl
    if (!window.skillMesh?.hub?.deleteSkill) {
      get().showToast('当前环境不支持删除', 'error')
      return { ok: false, message: '无 IPC' }
    }
    const result = await window.skillMesh.hub.deleteSkill({
      baseUrl,
      namespace: item.namespace,
      slug: item.slug,
      ownerId: get().account.userId,
    })
    if (!result.ok) {
      get().showToast(result.message || '删除失败', 'error')
      return result
    }
    set((s) => ({
      publishItems: s.publishItems.filter((p) => p.id !== publishId),
    }))
    get().showToast(`已删除 ${item.namespace}/${item.slug}`, 'success')
    get().persist()
    return { ok: true }
  },

  setPublishFilter: (f) => set({ publishFilter: f }),
  pushNotification: (msg, taskId, tone = 'info') => {
    set((s) => ({
      notifications: [
        {
          id: uid('notify'),
          message: msg,
          createdAt: new Date().toISOString(),
          read: false,
          taskId,
        },
        ...s.notifications,
      ].slice(0, 20),
    }))
    get().showToast(msg, tone)
  },
  markNotificationsRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),
  markNotificationRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    })),
  showToast: (message, tone = 'info') =>
    set({
      toast: { id: uid('toast'), message, tone },
    }),
  clearToast: () => set({ toast: null }),
  setHighlightTaskId: (taskId) => set({ highlightTaskId: taskId }),
  setTheme: (theme) => {
    const next = normalizeTheme(theme)
    applyTheme(next)
    set({ theme: next })
    get().persist()
  },
  setSyncServiceRunning: (running) => {
    set({ syncServiceRunning: running })
    get().showToast(running ? '同步服务已启动' : '同步服务已停止', running ? 'success' : 'warning')
    get().persist()
  },
  clearStorageCache: () => {
    set({ storageUsedGb: 0 })
    get().showToast('已清理缓存与临时日志', 'success')
    get().persist()
  },
  goDiscoverUpdates: () => {
    set({
      statusFilter: 'update_available',
      discoverTab: 'recommended',
      sourceFilter: 'all',
      categoryFilter: '全部',
    })
  },
  openSkillDirectory: async (skillUid) => {
    const skill = get().skills.find((s) => s.uid === skillUid)
    if (!skill?.installed) {
      get().pushNotification('Skill 尚未安装，无法打开目录')
      return
    }
    const api = window.skillMesh?.shell.openSkillDir
    if (!api) {
      get().pushNotification('当前环境不支持打开本地目录')
      return
    }
    const result = await api({
      localPath: skill.localPath,
      skill: {
        skillId: skill.skillId,
        name: skill.name,
        description: skill.description,
        version: skill.version,
        latestVersion: skill.latestVersion,
        sourceId: skill.sourceId,
        sourceName: skill.sourceName,
        namespace: skill.namespace,
      },
    })
    if (result?.ok) {
      if (result.localPath && result.localPath !== skill.localPath) {
        set((s) => ({
          skills: s.skills.map((item) =>
            item.uid === skillUid ? { ...item, localPath: result.localPath } : item,
          ),
        }))
        get().persist()
      }
      return
    }
    get().pushNotification(result?.error || '无法打开 Skill 目录')
  },
}))

export function selectFilteredSkills(state: AppState): Skill[] {
  // 发现页：不展示新建 / 本地导入
  let list = state.skills.filter((s) => !isLocalMineSkill(s))
  const q = state.discoverSearchQuery.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q)
        || s.description.toLowerCase().includes(q)
        || s.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }
  if (state.discoverTab === 'favorites') list = list.filter((s) => s.favorite)
  if (state.sourceFilter !== 'all') list = list.filter((s) => s.sourceId === state.sourceFilter)
  if (state.categoryFilter !== '全部') {
    list = list.filter((s) => s.category === state.categoryFilter)
  }
  if (state.statusFilter !== 'all') list = list.filter((s) => skillStatus(s) === state.statusFilter)
  if (state.discoverTab === 'latest' || state.sortBy === 'latest') {
    list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  } else if (state.discoverTab === 'hot' || state.sortBy === 'hot') {
    list.sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
  } else if (state.sortBy === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  } else {
    list.sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.downloads || 0) - (a.downloads || 0))
  }
  return list
}

/** 我的：本地新建 + 本地导入 + 发现中已安装 */
export function selectMineSkills(state: AppState): Skill[] {
  let list = state.skills.filter((s) => isLocalMineSkill(s) || isHubInstalledSkill(s))
  if (state.mineTab === 'mine') list = list.filter((s) => isLocalMineSkill(s))
  if (state.mineTab === 'hub') list = list.filter((s) => isHubInstalledSkill(s))
  const q = state.installedSearchQuery.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q)
        || s.description.toLowerCase().includes(q)
        || s.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }
  return list
}

export function selectInstalledSkills(state: AppState): Skill[] {
  return selectMineSkills({ ...state, mineTab: 'all' })
}

export function selectLatestDiscoverSkills(state: AppState, limit = 3): Skill[] {
  return [...selectFilteredSkills({ ...state, discoverTab: 'latest', sortBy: 'latest' })]
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .slice(0, limit)
}

export function selectCreatedSkills(state: AppState): Skill[] {
  return state.skills.filter((s) => s.origin === 'created')
}

export function selectPublishableSkills(state: AppState): Skill[] {
  return state.skills.filter((s) => s.origin === 'created' || s.origin === 'imported')
}

export function selectRunningTaskCount(state: AppState) {
  return state.tasks.filter((t) => t.status === 'running' || t.status === 'pending').length
}

export function selectFailedTaskCount(state: AppState) {
  return state.tasks.filter((t) => t.status === 'failed').length
}

/** @deprecated 使用 selectRunningTaskCount + selectFailedTaskCount */
export function selectActiveTaskCount(state: AppState) {
  return selectRunningTaskCount(state) + selectFailedTaskCount(state)
}

export { CATEGORY_CHIPS }
export type { TaskKind }
