/// <reference types="vite/client" />
import type { AgentInstallation, AppAccount, PersistedUiState, SkillSource, SourceNamespace } from '@/types'

export interface SkillMeshApi {
  platform: string
  versions: { electron?: string; chrome?: string; node?: string }
  storage: {
    loadState: () => Promise<PersistedUiState | null>
    saveState: (state: PersistedUiState) => Promise<{ ok: boolean }>
  }
  dialog: {
    openSkillPackage: () => Promise<string | null>
    openDirectory: (payload?: { title?: string; defaultPath?: string }) => Promise<string | null>
    confirm: (payload: { title?: string; message?: string; detail?: string }) => Promise<boolean>
    restartPrompt: (payload: {
      title?: string
      message?: string
      detail?: string
    }) => Promise<'relaunch' | 'later'>
  }
  shell: {
    openPath: (targetPath: string) => Promise<{ ok: boolean; error?: string }>
    openExternal: (targetUrl: string) => Promise<{ ok: boolean; error?: string }>
    openSkillDir: (payload: string | {
      localPath?: string
      skill?: {
        skillId: string
        name: string
        description?: string
        version: string
        latestVersion?: string
        sourceId: string
        sourceName?: string
        namespace?: string
      }
    }) => Promise<{ ok: boolean; error?: string; path?: string; localPath?: string }>
  }
  agents: {
    scan: () => Promise<AgentInstallation[]>
    validateSkillPath: (payload: { path: string }) => Promise<{
      ok: boolean
      error?: string
      path?: string
      displayPath?: string
    }>
    syncSkill: (payload: {
      action: 'link' | 'unlink'
      skill: {
        skillId: string
        name: string
        description?: string
        version: string
        sourceId: string
        sourceName?: string
        namespace?: string
        localPath?: string
      }
      agentSkillPath: string
    }) => Promise<{ ok: boolean; error?: string; destPath?: string }>
  }
  skills: {
    ensurePackage: (skill: {
      skillId: string
      name: string
      description?: string
      version: string
      sourceId: string
      sourceName?: string
      namespace?: string
      latestVersion?: string
      localPath?: string
      content?: string
      homepageUrl?: string
      githubUrl?: string
      packageSource?: import('@/types').Skill['packageSource']
      registryUrl?: string
      token?: string
      origin?: import('@/types').Skill['origin']
      forceFetch?: boolean
      contentHash?: string
    }) => Promise<{
      ok: boolean
      localPath?: string
      error?: string
      contentFetched?: boolean
      contentSource?: string
      contentHash?: string
    }>
    removePackage: (localPath: string) => Promise<{ ok: boolean }>
    verifyPackage: (payload: {
      localPath?: string
      contentHash?: string
      name?: string
      description?: string
      version?: string
      sourceId?: string
      sourceName?: string
    }) => Promise<{
      ok: boolean
      exists?: boolean
      isStub?: boolean
      contentHash?: string
      hashMatches?: boolean
      error?: string
    }>
    verifyPackages: (
      items: Array<{
        uid: string
        localPath?: string
        contentHash?: string
        name?: string
        description?: string
        version?: string
        sourceId?: string
        sourceName?: string
      }>,
    ) => Promise<{
      ok: boolean
      results: Record<
        string,
        {
          ok: boolean
          exists?: boolean
          isStub?: boolean
          contentHash?: string
          hashMatches?: boolean
          error?: string
        }
      >
    }>
    readMarkdown: (payload: {
      localPath?: string
      skill?: {
        skillId: string
        name: string
        description?: string
        version: string
        sourceId: string
        sourceName?: string
        namespace?: string
        localPath?: string
        content?: string
      }
    }) => Promise<{
      ok: boolean
      content?: string
      fileName?: string
      path?: string
      displayPath?: string
      isStub?: boolean
      error?: string
    }>
    packZip: (payload: {
      skill: {
        skillId: string
        name: string
        description?: string
        version: string
        sourceId: string
        sourceName?: string
        namespace?: string
        localPath?: string
        content?: string
        origin?: import('@/types').Skill['origin']
      }
      version?: string
    }) => Promise<{
      ok: boolean
      zipPath?: string
      version?: string
      name?: string
      tmpDir?: string
      error?: string
    }>
  }
  hub: {
    publish: (payload: {
      baseUrl: string
      namespace: string
      visibility: string
      zipPath: string
      confirmWarnings?: boolean
      tmpDir?: string
    }) => Promise<{
      ok: boolean
      message?: string
      confirmRequired?: boolean
      serverMessage?: string
      result?: {
        skillId?: number | string
        namespace?: string
        slug?: string
        version?: string
        status?: string
      }
    }>
    withdrawReview: (payload: {
      baseUrl: string
      namespace: string
      slug: string
      version: string
    }) => Promise<{ ok: boolean; message?: string }>
    deleteSkill: (payload: {
      baseUrl: string
      namespace: string
      slug: string
      ownerId?: string
    }) => Promise<{ ok: boolean; message?: string }>
    getSkillVersionStatus: (payload: {
      baseUrl: string
      namespace: string
      slug: string
      version: string
    }) => Promise<{
      ok: boolean
      message?: string
      status?: string
      version?: string
      reviewComment?: string
    }>
  }
  sources: {
    testConnection: (payload: Pick<SkillSource, 'registryUrl' | 'token' | 'type'>) => Promise<{
      ok: boolean
      status: 'connected' | 'disconnected' | 'checking'
      message?: string
      baseUrl?: string
    }>
    listSkills: (payload: {
      registryUrl?: string
      token?: string
      sourceId: string
      sourceName: string
      type?: SkillSource['type']
      query?: string
      limit?: number
      useSession?: boolean
      namespaces?: Array<string | SourceNamespace>
    }) => Promise<{
      ok: boolean
      skills: import('@/types').Skill[]
      message?: string
      baseUrl?: string
    }>
  }
  auth: {
    login: (payload: {
      baseUrl: string
      username: string
      password: string
    }) => Promise<{ ok: boolean; message?: string; account?: AppAccount }>
    logout: (payload: { baseUrl?: string }) => Promise<{ ok: boolean }>
    me: (payload: { baseUrl: string }) => Promise<{
      ok: boolean
      loggedIn: boolean
      message?: string
      account?: AppAccount
    }>
    myNamespaces: (payload: { baseUrl: string }) => Promise<{
      ok: boolean
      unauthorized?: boolean
      namespaces: SourceNamespace[]
      message?: string
    }>
  }
  app: {
    relaunch: () => Promise<{ ok: boolean }>
    getPaths: () => Promise<{
      ok: boolean
      dataRoot?: string
      dataRootDisplay?: string
      skillsRoot?: string
      skillsRootDisplay?: string
      skillsRootDefault?: string
      skillsRootDefaultDisplay?: string
      stateFile?: string
      stateFileDisplay?: string
    }>
    setSkillsRoot: (payload: { path: string }) => Promise<{
      ok: boolean
      error?: string
      path?: string
      displayPath?: string
      restartRequired?: boolean
    }>
    getDiskSpace: (payload?: { path?: string }) => Promise<{
      ok: boolean
      error?: string
      path?: string
      volumeLabel?: string
      totalGb?: number
      freeGb?: number
      usedGb?: number
      skillsUsedGb?: number
      totalBytes?: number
      freeBytes?: number
      usedBytes?: number
      skillsUsedBytes?: number
    }>
  }
  logs: {
    getInfo: () => Promise<{
      ok: boolean
      logsDir?: string
      logsDirDisplay?: string
      todayFile?: string
      todayFileDisplay?: string
      retainDays?: number
      dataRoot?: string
      dataRootDisplay?: string
    }>
    append: (payload: {
      level?: string
      message: string
      meta?: unknown
    }) => Promise<{ ok: boolean; file?: string; error?: string }>
    purge: () => Promise<{ ok: boolean; removed?: string[] }>
    openDir: () => Promise<{ ok: boolean; error?: string; path?: string; pathDisplay?: string }>
  }
}

declare global {
  interface Window {
    skillMesh?: SkillMeshApi
  }
}

export {}
