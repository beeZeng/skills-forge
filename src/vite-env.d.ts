/// <reference types="vite/client" />
import type { AgentInstallation, AppAccount, PersistedUiState, SkillSource, SourceNamespace } from '@/types'

export type PublishPrepareResult = {
  ok: boolean
  error?: string
  message?: string
  errors?: string[]
  warnings?: string[]
  needsEntrySelection?: boolean
  ready?: boolean
  kind?: 'standard' | 'ordinary'
  sessionId?: string
  sessionDir?: string
  extractDir?: string
  packageDir?: string
  zipPath?: string
  zipHash?: string
  zipBytes?: number
  zipName?: string
  rootName?: string
  entry?: string
  entryCandidates?: string[]
  suggestedName?: string
  manifest?: import('@/types').SkillManifest
  readme?: string
  skillMd?: string
  fileTree?: import('@/types').SkillPackageFileNode[]
  files?: string[]
  contentHash?: string
  installTarget?: string
}

export interface SkillMeshApi {
  platform: string
  versions: { electron?: string; chrome?: string; node?: string }
  storage: {
    loadState: () => Promise<PersistedUiState | null>
    saveState: (state: PersistedUiState) => Promise<{ ok: boolean }>
  }
  dialog: {
    openSkillPackage: () => Promise<string | null>
    openPublishZip: () => Promise<string | null>
    openDirectory: (payload?: { title?: string; defaultPath?: string }) => Promise<string | null>
    confirm: (payload: { title?: string; message?: string; detail?: string }) => Promise<boolean>
    restartPrompt: (payload: {
      title?: string
      message?: string
      detail?: string
    }) => Promise<'relaunch' | 'later'>
    skillConflict: (payload: {
      title?: string
      message?: string
      detail?: string
      conflict?: 'hash_mismatch' | 'version_update' | string
      skill_id?: string
      version?: string
      existing?: unknown
      incoming?: { skill_id?: string; name?: string; version?: string; hash?: string; source?: string }
    }) => Promise<{ resolution: 'overwrite' | 'update' | 'keep' | 'cancel' }>
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
        agentInstallPath?: string
      }
      agentSkillPath: string
    }) => Promise<{ ok: boolean; error?: string; destPath?: string }>
  }
  skills: {
    ensurePackage: (skill: {
      uid?: string
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
      author?: string
      tags?: string[]
      license?: string
      conflictResolution?: 'overwrite' | 'update' | 'keep' | 'cancel'
      skipAgentInstall?: boolean
    }) => Promise<{
      ok: boolean
      localPath?: string
      error?: string
      contentFetched?: boolean
      contentSource?: string
      contentHash?: string
      zipPath?: string
      zipHash?: string
      agentInstallPath?: string
      manifest?: import('@/types').SkillManifest
      conflict?: 'hash_mismatch'
      cancelled?: boolean
      existing?: {
        skill_id?: string
        name?: string
        version?: string
        hash?: string
        source?: string
      }
      incoming?: {
        skill_id?: string
        name?: string
        version?: string
        hash?: string
        source?: string
      }
    }>
    removePackage: (
      localPath:
        | string
        | { localPath?: string; name?: string; skillName?: string; skill_id?: string; skillId?: string },
    ) => Promise<{ ok: boolean }>
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
      manifest?: import('@/types').SkillManifest
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
    installToAgent: (payload: {
      zipPath: string
      expectedHash?: string
      zipHash?: string
      sourceId?: string
      skillUid?: string
      force?: boolean
    }) => Promise<{
      ok: boolean
      error?: string
      installPath?: string
      zipHash?: string
      manifest?: import('@/types').SkillManifest
    }>
    uninstallFromAgent: (payload: { name?: string; skillName?: string }) => Promise<{
      ok: boolean
      error?: string
      removedPath?: string
    }>
    readPackageMeta: (payload: {
      localPath?: string
      agentInstallPath?: string
      name?: string
    }) => Promise<{
      ok: boolean
      error?: string
      path?: string
      absolutePath?: string
      manifest?: import('@/types').SkillManifest | null
      readme?: string
      fileTree?: import('@/types').SkillPackageFileNode[]
    }>
    listPackageTree: (payload: {
      localPath?: string
      agentInstallPath?: string
      name?: string
    }) => Promise<{
      ok: boolean
      error?: string
      path?: string
      fileTree?: import('@/types').SkillPackageFileNode[]
    }>
    listAgentInstalled: () => Promise<{
      ok: boolean
      skills: Array<{
        name: string
        version: string
        installedAt?: string
        install_time?: string
        contentHash?: string
        hash?: string
        installPath?: string
        install_path?: string
        skill_id?: string
        source?: string
        status?: string
      }>
      root?: string
      registryPath?: string
      stats?: Record<string, number>
    }>
    scanLocal: (payload?: { forceFull?: boolean }) => Promise<{
      ok: boolean
      skills: Array<{
        skill_id: string
        name: string
        version: string
        source: string
        status?: string
        install_path?: string
        hash?: string
      }>
      root?: string
      registryPath?: string
      stats?: Record<string, number>
    }>
    getRegistry: () => Promise<{
      ok: boolean
      skills: Array<Record<string, unknown>>
      root?: string
      registryPath?: string
      registry?: { version?: number; scannedAt?: string | null; skills?: Record<string, unknown> }
    }>
    resolveConflict: (payload: {
      zipPath: string
      expectedHash?: string
      zipHash?: string
      sourceId?: string
      skillUid?: string
      conflictResolution?: 'overwrite' | 'update' | 'keep' | 'cancel'
      skillMeta?: Record<string, unknown>
    }) => Promise<{
      ok: boolean
      error?: string
      installPath?: string
      manifest?: import('@/types').SkillManifest
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
        agentInstallPath?: string
        content?: string
        zipPath?: string
        author?: string
        origin?: import('@/types').Skill['origin']
        manifest?: import('@/types').SkillManifest
      }
      version?: string
    }) => Promise<{
      ok: boolean
      zipPath?: string
      version?: string
      name?: string
      tmpDir?: string | null
      localPath?: string
      reusedZip?: boolean
      error?: string
    }>
    preparePublish: (payload: {
      zipPath: string
      username?: string
      userId?: string
      author?: string
      displayName?: string
      name?: string
      description?: string
      version?: string
      entry?: string
      existingSkillIds?: string[]
      maxZipBytes?: number
      maxFileBytes?: number
    }) => Promise<PublishPrepareResult>
    finalizePublish: (payload: {
      sessionDir?: string
      sessionId?: string
      extractDir?: string
      kind?: 'standard' | 'ordinary'
      entry?: string
      entryCandidates?: string[]
      username?: string
      author?: string
      name?: string
      description?: string
      version?: string
      existingSkillIds?: string[]
      warnings?: string[]
    }) => Promise<PublishPrepareResult>
    cleanupPublish: (payload: { sessionDir?: string; sessionId?: string }) => Promise<{ ok: boolean }>
  }
  hub: {
    publish: (payload: {
      baseUrl: string
      namespace: string
      visibility: string
      zipPath: string
      confirmWarnings?: boolean
      tmpDir?: string
      sessionDir?: string
    }) => Promise<{
      ok: boolean
      message?: string
      status?: number
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
    me: (payload: { baseUrl: string; persistTtlMs?: number }) => Promise<{
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
      programPath?: string
      programPathDisplay?: string
      userDataPath?: string
      userDataPathDisplay?: string
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
    getVersionInfo: () => Promise<{
      ok: boolean
      current?: string
      currentValid?: boolean
      latest?: string | null
      notes?: string
      publishedAt?: string | null
      updateAvailable?: boolean
      lastCheckedAt?: string | null
      feedUrl?: string
      platform?: string
      pendingInstall?: {
        version?: string
        installerPath?: string
        downloadedAt?: string
        size?: number
      } | null
      canRollback?: boolean
      lastGoodVersion?: string | null
      programPath?: string
      userDataPath?: string
      dataRoot?: string
    }>
    checkUpdate: (payload?: { force?: boolean }) => Promise<{
      ok: boolean
      current?: string
      latest?: string | null
      notes?: string
      publishedAt?: string | null
      updateAvailable?: boolean
      downloadUrl?: string | null
      platform?: string
      skipped?: boolean
      message?: string
      error?: string
    }>
    downloadUpdate: (payload?: { url?: string; version?: string }) => Promise<{
      ok: boolean
      version?: string
      installerPath?: string
      size?: number
      error?: string
    }>
    installUpdate: () => Promise<{
      ok: boolean
      message?: string
      error?: string
      targetVersion?: string
      canRollback?: boolean
    }>
    rollbackUpdate: () => Promise<{
      ok: boolean
      message?: string
      error?: string
      version?: string
    }>
    setUpdateFeedUrl: (payload: { url: string }) => Promise<{ ok: boolean; url?: string }>
    getPendingApplyStatus: () => Promise<{
      ok: boolean
      pending?: boolean
      applied?: boolean
      version?: string
      expected?: string
      current?: string
      canRollback?: boolean
      message?: string
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
  analytics: {
    getStats: (payload: Record<string, unknown>) => Promise<{
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
      badges?: Array<'new' | 'editor' | 'fast_growth' | 'hot'>
      favorited?: boolean
    }>
    getBulkStats: (payload: {
      items: Array<Record<string, unknown>>
      userId?: string
    }) => Promise<{
      ok: boolean
      stats?: Record<string, {
        views?: number
        favorites?: number
        downloads?: number
        installs?: number
        usage?: number
        score?: number
        recentGrowth?: number
        badges?: Array<'new' | 'editor' | 'fast_growth' | 'hot'>
        favorited?: boolean
      }>
    }>
    recordView: (payload: Record<string, unknown>) => Promise<{
      ok: boolean
      counted?: boolean
      views?: number
      favorites?: number
      downloads?: number
      installs?: number
      usage?: number
      score?: number
      badges?: Array<'new' | 'editor' | 'fast_growth' | 'hot'>
    }>
    favorite: (payload: Record<string, unknown>) => Promise<{
      ok: boolean
      favorited?: boolean
      favorites?: number
      views?: number
      downloads?: number
      installs?: number
      usage?: number
      score?: number
      badges?: Array<'new' | 'editor' | 'fast_growth' | 'hot'>
    }>
    unfavorite: (payload: Record<string, unknown>) => Promise<{
      ok: boolean
      favorited?: boolean
      favorites?: number
      views?: number
      downloads?: number
      installs?: number
      usage?: number
      score?: number
      badges?: Array<'new' | 'editor' | 'fast_growth' | 'hot'>
    }>
    recordDownload: (payload: Record<string, unknown>) => Promise<{
      ok: boolean
      counted?: boolean
      downloads?: number
      installs?: number
      views?: number
      favorites?: number
      usage?: number
      score?: number
      badges?: Array<'new' | 'editor' | 'fast_growth' | 'hot'>
    }>
    recordInstall: (payload: Record<string, unknown>) => Promise<{
      ok: boolean
      counted?: boolean
      installs?: number
      downloads?: number
      views?: number
      favorites?: number
      usage?: number
      score?: number
      badges?: Array<'new' | 'editor' | 'fast_growth' | 'hot'>
    }>
    recordUsage: (payload: Record<string, unknown>) => Promise<{
      ok: boolean
      counted?: boolean
      usage?: number
    }>
    listPending: () => Promise<{ ok: boolean; pending?: Array<Record<string, unknown>> }>
    clearPending: (payload?: { ids?: string[] }) => Promise<{ ok: boolean; remaining?: number }>
  }
  skillIndex: {
    getMeta: () => Promise<{ ok: boolean; exists?: boolean; count?: number; updatedAt?: string | null }>
    readAll: () => Promise<{
      ok: boolean
      updatedAt?: string | null
      count?: number
      skills?: Array<Record<string, unknown>>
    }>
    replaceAll: (payload: {
      skills: Array<Record<string, unknown>>
      updatedAt?: string
    }) => Promise<{ ok: boolean; count?: number; updatedAt?: string }>
    search: (payload: {
      query?: string
      limit?: number
    }) => Promise<{ ok: boolean; skills?: Array<Record<string, unknown>>; total?: number }>
  }
}

declare global {
  interface Window {
    skillMesh?: SkillMeshApi
  }
}

export {}
