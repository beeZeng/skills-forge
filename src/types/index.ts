export type InstallStatus = 'not_installed' | 'installed' | 'update_available'
export type SyncStatus = 'unsynced' | 'syncing' | 'synced' | 'failed'
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
export type TaskKind =
  | 'download'
  | 'install'
  | 'update'
  | 'delete'
  | 'import'
  | 'parse'
  | 'sync'
  | 'unsync'
  | 'publish'
  | 'create'

export type SourceStatus = 'connected' | 'disconnected' | 'checking'
export type SourceAuthStatus = 'ok' | 'lost' | 'checking'
export type NamespaceRole = 'OWNER' | 'ADMIN' | 'MEMBER'
export type PublishStatus = 'published' | 'reviewing' | 'rejected' | 'uploaded' | 'withdrawn'
export type SkillVisibility = 'PUBLIC' | 'NAMESPACE_ONLY' | 'PRIVATE'
export type SkillOrigin = 'catalog' | 'created' | 'imported'
export type AppTheme =
  | 'system'
  | 'dark'
  | 'light'
  | 'sapphiredusk'
  | 'tron'
  | 'gildedgrove'
  | 'gloom'
  | 'desertbloom'

/** App-level SkillHub account (shared with Pangu Hub). */
export interface AppAccount {
  loggedIn: boolean
  userId?: string
  displayName?: string
  email?: string
  hubBaseUrl: string
}

export interface SourceNamespace {
  slug: string
  displayName: string
  role: NamespaceRole
  status: 'ACTIVE' | 'FROZEN' | 'ARCHIVED' | string
}

export interface DiscoveredHub {
  baseUrl: string
  name: string
  namespaces: SourceNamespace[]
  connected: boolean
}

export interface SkillSource {
  id: string
  name: string
  type: 'clawhub' | 'custom' | 'offline' | 'skillsmp' | 'palebluedot'
  registryUrl?: string
  token?: string
  enabled: boolean
  status: SourceStatus
  /** Bound to app SkillHub session (Pangu Hub). */
  accountBound?: boolean
  namespaces?: SourceNamespace[]
  authStatus?: SourceAuthStatus
  /** ISO time of last successful catalog refresh. */
  lastSyncedAt?: string
  /** Last catalog refresh error message (cleared on success). */
  lastSyncError?: string
}

export interface AgentInstallation {
  id: string
  type: string
  name: string
  installed: boolean
  /** Detected product / app version when available. */
  version?: string
  /** Executable file path if detected. */
  executablePath?: string
  /** App install directory (derived from executable / markers). */
  installPath?: string
  skillPath?: string
  defaultSkillPath?: string
  /** Official product homepage for not-installed agents. */
  homepageUrl?: string
  lastDetectedAt?: string
}

export interface Skill {
  uid: string
  sourceId: string
  sourceName: string
  namespace?: string
  skillId: string
  name: string
  description: string
  version: string
  latestVersion?: string
  author?: string
  tags: string[]
  category: string
  sizeLabel?: string
  license?: string
  updatedAt?: string
  lastSyncedAt?: string
  localPath?: string
  /** SHA-256 of installed package tree; used to detect local deletion / corruption. */
  contentHash?: string
  /** Where package body was downloaded from (github:/clawhub:/skillhub:…). */
  contentSource?: string
  /** Public listing / original page URL on the skill source. */
  homepageUrl?: string
  githubUrl?: string
  /** Where to download full package content from (GitHub / ClawHub / …). */
  packageSource?: {
    kind: 'github' | 'clawhub' | 'skillhub' | string
    githubUrl?: string
    owner?: string
    repo?: string
    branch?: string
    path?: string
    sourceSkillPath?: string
    clawhubSlug?: string
    /** SkillHub / Pangu registry base URL */
    baseUrl?: string
    namespace?: string
    slug?: string
    version?: string
  }
  installed: boolean
  updateAvailable: boolean
  favorite: boolean
  downloads?: number
  syncedAgents: string[]
  origin?: SkillOrigin
  content?: string
}

export interface TaskItem {
  id: string
  title: string
  subtitle?: string
  kind: TaskKind
  status: TaskStatus
  progress?: number
  skillUid?: string
  agentId?: string
  error?: string
  createdAt: string
  updatedAt: string
  kindLabel?: string
  skillName?: string
  sourceName?: string
  sizeLabel?: string
  agentName?: string
  detail?: string
  filePath?: string
}

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

export interface NotificationItem {
  id: string
  message: string
  createdAt: string
  read: boolean
  taskId?: string
}

export interface PublishItem {
  id: string
  skillUid: string
  name: string
  version: string
  sourceName: string
  namespace?: string
  /** Remote skill slug on SkillHub */
  slug?: string
  remoteSkillId?: number | string
  visibility?: SkillVisibility
  status: PublishStatus
  reason?: string
  createdAt?: string
}

export type DiscoverTab = 'recommended' | 'latest' | 'hot' | 'favorites'
export type MineTab = 'all' | 'mine' | 'hub'
export type SkillSort = 'recommended' | 'latest' | 'hot' | 'name'
export type SkillInstallFilter = 'all' | 'not_installed' | 'installed' | 'update_available'

export interface PersistedUiState {
  favorites: string[]
  installedUids: string[]
  skillOverrides: Record<string, Partial<Skill>>
  syncedAgents: Record<string, string[]>
  sources: SkillSource[]
  tasks: TaskItem[]
  publishItems: PublishItem[]
  sidebarCollapsed: boolean
  /** Local-owned skills (created + imported). Field name kept for persistence compat. */
  createdSkills?: Skill[]
  newSkillsFolder?: string
  agentPathOverrides?: Record<string, string>
  theme?: AppTheme
  panguHubUrl?: string
  accountHint?: Pick<AppAccount, 'loggedIn' | 'hubBaseUrl' | 'userId' | 'displayName' | 'email'>
  /** Agents that receive newly installed Skills automatically. */
  defaultSyncAgentIds?: string[]
  /** Local Nexus skills repository root (display path). */
  skillsRootPath?: string
  /** ISO time of last successful full/partial catalog refresh. */
  lastCatalogSyncedAt?: string
}
