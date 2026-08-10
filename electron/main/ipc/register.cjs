const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')
const {
  buildLocalSkillPath,
  ensureSkillPackage,
  cacheSkillZip,
  linkSkillToAgent,
  unlinkSkillFromAgent,
  removeSkillPackage,
  resolveSkillDirectory,
  toDisplayPath,
  validateAgentSkillPath,
  readSkillMarkdown,
  getDefaultSkillsRoot,
  resolveSkillsRoot,
  expandPath,
  verifySkillPackage,
  isStubSkillMarkdown,
  isLocalOrigin,
  findSkillMdPath,
} = require('../skills/sync.cjs')
const registry = require('../registry/index.cjs')
const skillhubAuth = require('../registry/skillhub-auth.cjs')
const skillhubPublish = require('../registry/skillhub-publish.cjs')
const { packSkillZip, cleanupPack } = require('../skills/pack.cjs')
const publishPipeline = require('../skills/publish-pipeline.cjs')
const { fetchSkillPackageContent } = require('../skills/fetch-content.cjs')
const { getDiskSpace } = require('../fs/disk-space.cjs')
const appLog = require('../logging/app-log.cjs')
const agentManager = require('../skills/agent-manager.cjs')
const { createSkillAnalytics } = require('../skills/skill-analytics.cjs')
const { createSkillIndex } = require('../skills/skill-index.cjs')
const { createAppUpdater } = require('../update/app-updater.cjs')

/** Register (or replace) an ipcMain handle — safe across reloads / double-init. */
function safeHandle(channel, handler) {
  try {
    ipcMain.removeHandler(channel)
  } catch {
    // ignore
  }
  ipcMain.handle(channel, handler)
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

function envPath(name, fallback) {
  const value = process.env[name]
  return value && value.trim() ? value : fallback
}

function uniqueExisting(paths) {
  const seen = new Set()
  const found = []
  for (const p of paths) {
    if (!p || seen.has(p)) continue
    seen.add(p)
    try {
      if (fs.existsSync(p)) found.push(p)
    } catch {
      // ignore permission / invalid path errors
    }
  }
  return found
}

/** Resolve CLI binaries from PATH (covers custom Windows installs). */
function findOnPath(binNames) {
  const pathEnv = process.env.PATH || process.env.Path || ''
  if (!pathEnv) return []
  const sep = process.platform === 'win32' ? ';' : ':'
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean).concat([''])
      : ['']
  const found = []
  const seen = new Set()
  for (const dir of pathEnv.split(sep)) {
    if (!dir) continue
    for (const bin of binNames) {
      for (const ext of exts) {
        const full = path.join(dir, `${bin}${ext}`)
        if (seen.has(full)) continue
        seen.add(full)
        try {
          if (fs.existsSync(full)) found.push(full)
        } catch {
          // ignore
        }
      }
    }
  }
  return found
}

function windowsAppCandidates(homeDir, relativeExePaths) {
  if (process.platform !== 'win32') return []
  const localAppData = envPath('LOCALAPPDATA', path.join(homeDir, 'AppData', 'Local'))
  const programFiles = envPath('PROGRAMFILES', 'C:\\Program Files')
  const programFilesX86 = envPath('PROGRAMFILES(X86)', 'C:\\Program Files (x86)')
  const out = []
  for (const rel of relativeExePaths) {
    // Per-user installers (Cursor etc.) usually land under LocalAppData\Programs
    out.push(path.join(localAppData, 'Programs', rel))
    out.push(path.join(programFiles, rel))
    out.push(path.join(programFilesX86, rel))
  }
  return out
}

function deriveInstallPath(executablePath) {
  if (!executablePath) return undefined
  if (/\.app$/i.test(executablePath)) return executablePath
  let dir = path.dirname(executablePath)
  const normalized = dir.replace(/\\/g, '/')
  const binMatch = normalized.match(/^(.*)\/resources\/app\/bin$/i)
  if (binMatch) return binMatch[1].split('/').join(path.sep)
  return dir
}

function readPlistVersion(appPath) {
  try {
    const plist = path.join(appPath, 'Contents', 'Info.plist')
    if (!fs.existsSync(plist)) return undefined
    const text = fs.readFileSync(plist, 'utf8')
    const short =
      text.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/i)?.[1] ||
      text.match(/<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/i)?.[1]
    return short?.trim() || undefined
  } catch {
    return undefined
  }
}

function readPackageJsonVersion(installPath) {
  if (!installPath) return undefined
  const candidates = [
    path.join(installPath, 'resources', 'app', 'package.json'),
    path.join(installPath, 'resources', 'app.asar.unpacked', 'package.json'),
    path.join(installPath, 'package.json'),
  ]
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (pkg?.version) return String(pkg.version)
    } catch {
      // continue
    }
  }
  return undefined
}

function readWindowsExeVersion(exePath) {
  if (process.platform !== 'win32' || !exePath || !/\.exe$/i.test(exePath)) return undefined
  if (!fs.existsSync(exePath)) return undefined
  try {
    const { execFileSync } = require('child_process')
    const escaped = String(exePath).replace(/'/g, "''")
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$v=(Get-Item -LiteralPath '${escaped}').VersionInfo; if($v.ProductVersion){$v.ProductVersion}elseif($v.FileVersion){$v.FileVersion}else{''}`,
      ],
      { encoding: 'utf8', timeout: 8000, windowsHide: true },
    )
    const version = String(out || '').trim()
    return version || undefined
  } catch {
    return undefined
  }
}

function detectAgentVersion({ executablePath, installPath }) {
  if (executablePath && /\.app$/i.test(executablePath)) {
    const v = readPlistVersion(executablePath)
    if (v) return v
  }
  const fromPkg = readPackageJsonVersion(installPath) || readPackageJsonVersion(executablePath && path.dirname(executablePath))
  if (fromPkg) return fromPkg
  return readWindowsExeVersion(executablePath)
}

function detectAgents(homeDir) {
  const appData = envPath('APPDATA', path.join(homeDir, 'AppData', 'Roaming'))
  const localAppData = envPath('LOCALAPPDATA', path.join(homeDir, 'AppData', 'Local'))

  const candidates = [
    {
      id: 'cursor',
      type: 'cursor',
      name: 'Cursor',
      homepageUrl: 'https://cursor.com',
      appPaths: [
        '/Applications/Cursor.app',
        path.join(homeDir, 'Applications', 'Cursor.app'),
        ...windowsAppCandidates(homeDir, [
          path.join('cursor', 'Cursor.exe'),
          path.join('Cursor', 'Cursor.exe'),
        ]),
      ],
      pathBins: ['cursor'],
      markerPaths: [
        path.join(homeDir, '.cursor'),
        path.join(appData, 'Cursor'),
        path.join(localAppData, 'Cursor'),
      ],
      skillPath: path.join(homeDir, '.cursor', 'skills'),
    },
    {
      id: 'claude-code',
      type: 'claude-code',
      name: 'Claude Code',
      homepageUrl: 'https://docs.anthropic.com/en/docs/claude-code',
      appPaths: windowsAppCandidates(homeDir, [
        path.join('Claude', 'Claude.exe'),
        path.join('Anthropic Claude', 'Claude.exe'),
      ]),
      pathBins: ['claude'],
      markerPaths: [
        path.join(homeDir, '.claude'),
        path.join(appData, 'Claude'),
        path.join(localAppData, 'AnthropicClaude'),
      ],
      skillPath: path.join(homeDir, '.claude', 'skills'),
    },
    {
      id: 'codex',
      type: 'codex',
      name: 'Codex',
      homepageUrl: 'https://openai.com/codex',
      appPaths: windowsAppCandidates(homeDir, [
        path.join('Codex', 'Codex.exe'),
        path.join('OpenAI Codex', 'Codex.exe'),
      ]),
      pathBins: ['codex'],
      markerPaths: [
        path.join(homeDir, '.codex'),
        path.join(appData, 'Codex'),
        path.join(localAppData, 'Codex'),
      ],
      skillPath: path.join(homeDir, '.codex', 'skills'),
    },
    {
      id: 'piagent',
      type: 'piagent',
      name: 'PiAgent',
      homepageUrl: 'https://pi.dev',
      appPaths: windowsAppCandidates(homeDir, [
        path.join('PiAgent', 'PiAgent.exe'),
        path.join('piagent', 'PiAgent.exe'),
      ]),
      pathBins: ['piagent', 'pi'],
      markerPaths: [
        path.join(homeDir, '.pi'),
        path.join(appData, 'PiAgent'),
        path.join(localAppData, 'PiAgent'),
      ],
      skillPath: path.join(homeDir, '.pi', 'skills'),
    },
    {
      id: 'qoder',
      type: 'qoder',
      name: 'Qoder',
      homepageUrl: 'https://qoder.com',
      appPaths: [
        '/Applications/Qoder.app',
        ...windowsAppCandidates(homeDir, [
          path.join('Qoder', 'Qoder.exe'),
          path.join('qoder', 'Qoder.exe'),
        ]),
      ],
      pathBins: ['qoder'],
      markerPaths: [
        path.join(homeDir, '.qoder'),
        path.join(appData, 'Qoder'),
        path.join(localAppData, 'Qoder'),
      ],
      skillPath: path.join(homeDir, '.qoder', 'skills'),
    },
    {
      id: 'trae',
      type: 'trae',
      name: 'Trae',
      homepageUrl: 'https://www.trae.ai',
      appPaths: [
        '/Applications/Trae.app',
        '/Applications/Trae CN.app',
        ...windowsAppCandidates(homeDir, [
          path.join('Trae', 'Trae.exe'),
          path.join('Trae CN', 'Trae CN.exe'),
          path.join('TraeCN', 'Trae CN.exe'),
        ]),
      ],
      pathBins: ['trae'],
      markerPaths: [
        path.join(homeDir, '.trae'),
        path.join(appData, 'Trae'),
        path.join(appData, 'Trae CN'),
        path.join(localAppData, 'Trae'),
        path.join(localAppData, 'Trae CN'),
      ],
      skillPath: path.join(homeDir, '.trae', 'skills'),
    },
    {
      id: 'opencode',
      type: 'opencode',
      name: 'OpenCode',
      homepageUrl: 'https://opencode.ai',
      appPaths: windowsAppCandidates(homeDir, [
        path.join('OpenCode', 'OpenCode.exe'),
        path.join('opencode', 'opencode.exe'),
      ]),
      pathBins: ['opencode'],
      markerPaths: [
        path.join(homeDir, '.opencode'),
        path.join(appData, 'OpenCode'),
        path.join(localAppData, 'OpenCode'),
      ],
      skillPath: path.join(homeDir, '.opencode', 'skills'),
    },
  ]

  const now = new Date().toISOString()
  return candidates.map((item) => {
    const existingApps = uniqueExisting(item.appPaths || [])
    const pathHits = findOnPath(item.pathBins || [])
    const existingMarkers = uniqueExisting(item.markerPaths || [])
    const skillDirExists = fs.existsSync(item.skillPath)
    const executablePath = existingApps[0] || pathHits[0]
    const installPath = deriveInstallPath(executablePath) || existingMarkers[0]
    const installed = Boolean(executablePath || existingMarkers.length || skillDirExists)
    const version = installed
      ? detectAgentVersion({ executablePath, installPath })
      : undefined
    return {
      id: item.id,
      type: item.type,
      name: item.name,
      installed,
      version: version || undefined,
      executablePath: executablePath || undefined,
      installPath: installPath || undefined,
      skillPath: item.skillPath,
      defaultSkillPath: item.skillPath,
      homepageUrl: item.homepageUrl,
      lastDetectedAt: now,
    }
  })
}

function registerIpc({ dataRoot, homeDir, skillsRoot: initialSkillsRoot }) {
  const stateFile = path.join(dataRoot, 'ui-state.json')
  const skillsRootFile = path.join(dataRoot, 'skills-root.json')
  const root = homeDir || os.homedir()
  let skillsRoot = resolveSkillsRoot(root, initialSkillsRoot)
  const analytics = createSkillAnalytics({ dataRoot })
  const skillIndex = createSkillIndex({ dataRoot })
  const appUpdater = createAppUpdater({ dataRoot })
  const pendingApply = appUpdater.finalizePendingOnLaunch()
  if (pendingApply?.message) {
    console.warn('[Nexus] update apply status:', pendingApply.message)
  }

  const refreshSkillsRootFromDisk = () => {
    const saved = readJson(skillsRootFile, null)
    skillsRoot = resolveSkillsRoot(root, saved?.path)
    return skillsRoot
  }

  // Skill analytics (local store; API-shaped for future remote sync)
  safeHandle('analytics:getStats', async (_event, payload) => analytics.getStats(payload || {}))
  safeHandle('analytics:getBulkStats', async (_event, payload) => analytics.getBulkStats(payload || {}))
  safeHandle('analytics:recordView', async (_event, payload) => analytics.recordView(payload || {}))
  safeHandle('analytics:favorite', async (_event, payload) => analytics.favorite(payload || {}))
  safeHandle('analytics:unfavorite', async (_event, payload) => analytics.unfavorite(payload || {}))
  safeHandle('analytics:recordDownload', async (_event, payload) => analytics.recordDownload(payload || {}))
  safeHandle('analytics:recordInstall', async (_event, payload) => analytics.recordInstall(payload || {}))
  safeHandle('analytics:recordUsage', async (_event, payload) => analytics.recordUsage(payload || {}))
  safeHandle('analytics:listPending', async () => analytics.listPending())
  safeHandle('analytics:clearPending', async (_event, payload) => analytics.clearPending(payload || {}))

  // Skill Index — durable catalog for Dashboard search
  safeHandle('skillIndex:getMeta', async () => skillIndex.getMeta())
  safeHandle('skillIndex:readAll', async () => skillIndex.readAll())
  safeHandle('skillIndex:replaceAll', async (_event, payload) => skillIndex.replaceAll(payload || {}))
  safeHandle('skillIndex:search', async (_event, payload) => skillIndex.search(payload || {}))

  safeHandle('storage:loadState', async () => readJson(stateFile, null))
  safeHandle('storage:saveState', async (_event, state) => {
    writeJson(stateFile, state ?? {})
    return { ok: true }
  })


  safeHandle('agents:scan', async () => detectAgents(homeDir || os.homedir()))

  safeHandle('agents:validateSkillPath', async (_event, payload) => {
    return validateAgentSkillPath(payload?.path, homeDir || os.homedir())
  })

  safeHandle('skills:readMarkdown', async (_event, payload) => {
    return readSkillMarkdown(homeDir || os.homedir(), payload || {}, skillsRoot)
  })

  safeHandle('agents:syncSkill', async (_event, payload) => {
    const { action, skill, agentSkillPath } = payload || {}
    if (!skill || !agentSkillPath) {
      return { ok: false, error: '缺少 Skill 或智能体目录' }
    }
    if (action === 'link') return linkSkillToAgent({ homeDir: root, skill, agentSkillPath })
    if (action === 'unlink') return unlinkSkillFromAgent({ homeDir: root, skill, agentSkillPath })
    return { ok: false, error: '未知同步操作' }
  })

  safeHandle('skills:ensurePackage', async (_event, skill) => {
    if (!skill) return { ok: false, error: '缺少 Skill 信息' }
    const preferred = skill.localPath
      ? expandPath(skill.localPath, root)
      : buildLocalSkillPath(root, skill, skillsRoot)
    if (!preferred) return { ok: false, error: '无法解析本地安装路径' }

    // Import a single markdown file as a skill package.
    const looksLikeMd =
      /\.md$/i.test(preferred) &&
      fs.existsSync(preferred) &&
      fs.statSync(preferred).isFile()
    if (looksLikeMd) {
      let mdContent = ''
      try {
        mdContent = fs.readFileSync(preferred, 'utf8')
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : '读取 Markdown 失败',
        }
      }
      const baseName =
        path.basename(preferred, path.extname(preferred)).replace(/[<>:"|?*\u0000-\u001f]+/g, '_') ||
        skill.skillId ||
        'skill'
      const destDir = path.join(path.dirname(preferred), `${baseName}-skill`)
      const written = ensureSkillPackage(destDir, {
        ...skill,
        name: skill.name || baseName,
        content: mdContent,
        origin: skill.origin || 'imported',
        sourceId: skill.sourceId || 'local',
      })
      if (!written.ok) {
        return {
          ok: false,
          error: written.error || '从 Markdown 创建 Skill 包失败',
          localPath: toDisplayPath(destDir, root),
        }
      }
      let zipPath
      let zipHash
      try {
        const zipped = await cacheSkillZip(
          destDir,
          {
            ...skill,
            ...written.manifest,
            name: written.manifest?.name || skill.name || baseName,
            version: written.manifest?.version || skill.version || '0.1.0',
            skill_id: written.manifest?.skill_id,
          },
          skillsRoot,
        )
        zipPath = zipped.zipPath
        zipHash = zipped.zipHash
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : '缓存 zip 失败',
          localPath: toDisplayPath(destDir, root),
          manifest: written.manifest,
        }
      }
      return {
        ok: true,
        localPath: toDisplayPath(destDir, root),
        contentSource: 'markdown',
        contentHash: written.contentHash,
        zipPath: zipPath ? toDisplayPath(zipPath, root) : undefined,
        zipHash,
        manifest: written.manifest,
      }
    }

    // Import / install from a local zip: unzip + normalize via installFromZip.
    const looksLikeZip =
      /\.(zip|skillpack)$/i.test(preferred) &&
      fs.existsSync(preferred) &&
      fs.statSync(preferred).isFile()
    if (looksLikeZip) {
      const installed = await agentManager.installFromZip({
        zipPath: preferred,
        homeDir: root,
        sourceId: skill.sourceId || 'local',
        skillUid: skill.uid,
        force: skill.forceFetch === true,
        conflictResolution: skill.conflictResolution || 'overwrite',
        skillMeta: {
          name: skill.name,
          skillId: skill.skillId,
          sourceId: skill.sourceId || 'local',
          version: skill.version || skill.latestVersion || '1.0.0',
          description: skill.description,
          author: skill.author,
          origin: skill.origin || 'imported',
          tags: skill.tags,
        },
      })
      if (!installed.ok) {
        return {
          ok: false,
          cancelled: installed.cancelled,
          error: installed.error || '从 zip 安装失败',
          conflict: installed.conflict,
          existing: installed.existing,
          incoming: installed.incoming,
          zipPath: preferred,
          zipHash: installed.zipHash,
        }
      }
      return {
        ok: true,
        localPath: toDisplayPath(installed.installPath, root),
        agentInstallPath: toDisplayPath(installed.installPath, root),
        contentHash: installed.manifest?.hash || installed.installed?.hash,
        contentSource: 'zip',
        zipPath: preferred,
        zipHash: installed.zipHash,
        manifest: installed.manifest,
        updated: installed.updated,
        upgraded: installed.upgraded,
      }
    }

    const local = isLocalOrigin(skill)
    let content = typeof skill.content === 'string' ? skill.content : undefined
    let files
    let contentSource

    const existingMd = findSkillMdPath(preferred)
    let existingText = ''
    try {
      if (existingMd) existingText = fs.readFileSync(existingMd, 'utf8')
    } catch {
      existingText = ''
    }
    const inlineStub = content ? isStubSkillMarkdown(content, skill) : false
    const existingStub = existingText ? isStubSkillMarkdown(existingText, skill) : false
    const hasGoodInline = Boolean(content && !inlineStub)
    const hasGoodExisting = Boolean(existingText && !existingStub)
    const needsFetch =
      skill.forceFetch === true ||
      (!local && !hasGoodInline && !hasGoodExisting) ||
      (local && !hasGoodInline && !hasGoodExisting)

    const finishPackage = async (pkgContent, pkgFiles, pkgSource, contentFetched) => {
      const written = ensureSkillPackage(preferred, {
        ...skill,
        content: pkgContent,
        files: pkgFiles,
        contentSource: pkgSource,
      })
      if (!written.ok) {
        return {
          ok: false,
          error: written.error || '写入 Skill 包失败',
          localPath: toDisplayPath(preferred, root),
        }
      }
      if (!local && written.isStub) {
        return {
          ok: false,
          error: '安装结果仍是简介占位，未写入完整内容',
          localPath: toDisplayPath(preferred, root),
        }
      }

      let zipPath
      let zipHash
      try {
        const zipped = await cacheSkillZip(
          preferred,
          {
            ...skill,
            ...written.manifest,
            name: written.manifest?.name || skill.name || skill.skillId,
            version: written.manifest?.version || skill.version || skill.latestVersion || '1.0.0',
            skillId: skill.skillId,
            sourceId: skill.sourceId,
            skill_id: written.manifest?.skill_id,
          },
          skillsRoot,
        )
        zipPath = zipped.zipPath
        zipHash = zipped.zipHash
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : '缓存 zip 失败',
          localPath: toDisplayPath(preferred, root),
        }
      }

      let agentInstall = null
      if (skill.skipAgentInstall !== true && zipPath) {
        agentInstall = await agentManager.installFromZip({
          zipPath,
          expectedHash: zipHash,
          homeDir: root,
          sourceId: skill.sourceId,
          skillUid: skill.uid,
          force: skill.forceFetch === true,
          conflictResolution: skill.conflictResolution,
          skillMeta: {
            name: skill.name,
            skillId: skill.skillId,
            sourceId: skill.sourceId,
            version: skill.version || skill.latestVersion,
            description: skill.description,
            author: skill.author,
            skill_id: written.manifest?.skill_id,
          },
        })
        if (!agentInstall.ok) {
          return {
            ok: false,
            error: agentInstall.error || '安装到本地 Agent 目录失败',
            conflict: agentInstall.conflict,
            existing: agentInstall.existing,
            incoming: agentInstall.incoming,
            cancelled: agentInstall.cancelled,
            localPath: toDisplayPath(preferred, root),
            zipPath: toDisplayPath(zipPath, root),
            zipHash,
            manifest: written.manifest,
          }
        }
      }

      return {
        ok: true,
        localPath: toDisplayPath(preferred, root),
        contentFetched: Boolean(contentFetched),
        contentSource: pkgSource,
        contentHash: written.contentHash,
        zipPath: zipPath ? toDisplayPath(zipPath, root) : undefined,
        zipHash,
        manifest: written.manifest || agentInstall?.manifest,
        agentInstallPath: agentInstall?.installPath
          ? toDisplayPath(agentInstall.installPath, root)
          : undefined,
        installedRecord: agentInstall?.installed,
        skill_id: (written.manifest || agentInstall?.manifest)?.skill_id,
      }
    }

    if (!needsFetch && hasGoodExisting && !hasGoodInline) {
      return finishPackage(existingText, undefined, skill.contentSource || 'existing', false)
    }

    if (needsFetch) {
      if (!local) content = undefined
      const fetched = await fetchSkillPackageContent({ ...skill, content: undefined })
      if (fetched.ok && fetched.content && !isStubSkillMarkdown(fetched.content, skill)) {
        content = fetched.content
        files = fetched.files
        contentSource = fetched.source
      } else if (!local) {
        return {
          ok: false,
          error: fetched.error || '未能下载 Skill 完整内容（仅有名称/简介）',
          localPath: toDisplayPath(preferred, root),
        }
      }
    }

    return finishPackage(content, files, contentSource, Boolean(content && content.trim()))
  })

  safeHandle('skills:installToAgent', async (_event, payload) => {
    const zipPath = payload?.zipPath ? expandPath(payload.zipPath, root) : ''
    if (!zipPath) return { ok: false, error: '缺少 zip 路径' }
    const result = await agentManager.installFromZip({
      zipPath,
      expectedHash: payload?.expectedHash || payload?.zipHash,
      homeDir: root,
      sourceId: payload?.sourceId,
      skillUid: payload?.skillUid,
      force: payload?.force === true,
      conflictResolution: payload?.conflictResolution,
      skillMeta: payload?.skillMeta || {},
    })
    if (!result.ok) return result
    return {
      ...result,
      installPath: result.installPath ? toDisplayPath(result.installPath, root) : undefined,
    }
  })

  safeHandle('skills:uninstallFromAgent', async (_event, payload) => {
    const id = payload?.skill_id || payload?.skillId || payload?.name || payload?.skillName
    if (!id) return { ok: false, error: '缺少 skill_id' }
    return agentManager.uninstall(id, root)
  })

  safeHandle('skills:scanLocal', async (_event, payload) => {
    return agentManager.scanLocalSkills(root, { forceFull: payload?.forceFull === true })
  })

  safeHandle('skills:getRegistry', async () => {
    const registry = agentManager.readRegistry(root)
    return {
      ok: true,
      registry,
      skills: Object.values(registry.skills || {}),
      root: toDisplayPath(agentManager.getAgentSkillsRoot(root), root),
      registryPath: toDisplayPath(agentManager.getRegistryPath(root), root),
    }
  })

  safeHandle('skills:readPackageMeta', async (_event, payload) => {
    const skillId = payload?.skill_id || payload?.skillId || payload?.name
    if (payload?.agentInstallPath || payload?.localPath || skillId) {
      return agentManager.readPackageMeta(
        payload?.agentInstallPath || payload?.localPath || skillId,
        root,
      )
    }
    return { ok: false, error: 'Skill 包目录不存在，请先安装' }
  })

  safeHandle('skills:listPackageTree', async (_event, payload) => {
    const skillId = payload?.skill_id || payload?.skillId || payload?.name
    return agentManager.listPackageTree(
      payload?.agentInstallPath || payload?.localPath || skillId,
      root,
    )
  })

  safeHandle('skills:listAgentInstalled', async () => {
    const scan = agentManager.scanLocalSkills(root, { forceFull: false })
    return {
      ok: true,
      skills: scan.skills,
      root: scan.root,
      registryPath: scan.registryPath,
      stats: scan.stats,
    }
  })

  safeHandle('skills:resolveConflict', async (_event, payload) => {
    // Convenience: re-run install with conflictResolution
    const zipPath = payload?.zipPath ? expandPath(payload.zipPath, root) : ''
    if (!zipPath) return { ok: false, error: '缺少 zip 路径' }
    return agentManager.installFromZip({
      zipPath,
      expectedHash: payload?.expectedHash || payload?.zipHash,
      homeDir: root,
      sourceId: payload?.sourceId,
      skillUid: payload?.skillUid,
      conflictResolution: payload?.conflictResolution || 'overwrite',
      skillMeta: payload?.skillMeta || {},
    })
  })

  safeHandle('dialog:skillConflict', async (_event, payload) => {
    const skillId = payload?.skill_id || payload?.incoming?.skill_id || 'Skill'
    const version = payload?.version || payload?.incoming?.version || ''
    const conflict = payload?.conflict || 'hash_mismatch'
    const isVersion = conflict === 'version_update'
    const existingVer = payload?.existing?.version || ''
    const incomingVer = payload?.incoming?.version || version
    const result = await dialog.showMessageBox({
      type: 'warning',
      buttons: isVersion ? ['取消', '保留旧版本', '更新'] : ['取消', '保留旧版本', '覆盖安装'],
      defaultId: 0,
      cancelId: 0,
      title: payload?.title || (isVersion ? '发现 Skill 新版本' : 'Skill 内容冲突'),
      message:
        payload?.message ||
        (isVersion
          ? `${skillId}：${existingVer} → ${incomingVer}`
          : `${skillId}@${version} 本地内容与待安装包 hash 不同`),
      detail:
        payload?.detail ||
        (isVersion
          ? '选择「更新」将备份旧版本后安装新版本；「保留旧版本」取消本次安装。'
          : '选择「覆盖安装」将备份旧版本后写入新内容；「保留旧版本」取消本次安装。'),
    })
    if (result.response === 2) return { resolution: isVersion ? 'update' : 'overwrite' }
    if (result.response === 1) return { resolution: 'keep' }
    return { resolution: 'cancel' }
  })

  safeHandle('skills:verifyPackage', async (_event, payload) => {
    return verifySkillPackage(root, payload || {})
  })

  safeHandle('skills:verifyPackages', async (_event, items) => {
    const list = Array.isArray(items) ? items : []
    const results = {}
    for (const item of list) {
      if (!item?.uid) continue
      results[item.uid] = verifySkillPackage(root, item)
    }
    return { ok: true, results }
  })

  safeHandle('skills:removePackage', async (_event, payload) => {
    const localPath = typeof payload === 'string' ? payload : payload?.localPath
    const skillId =
      typeof payload === 'object'
        ? payload?.skill_id || payload?.skillId || payload?.name || payload?.skillName
        : undefined
    removeSkillPackage(homeDir || os.homedir(), localPath)
    if (skillId) {
      try {
        agentManager.uninstall(skillId, root)
      } catch {
        // ignore
      }
    }
    return { ok: true }
  })

  safeHandle('shell:openSkillDir', async (_event, payload) => {
    const { shell } = require('electron')
    const input = typeof payload === 'string' ? { localPath: payload } : payload || {}
    let localPath = input.localPath
    const skill = input.skill

    if (!localPath && skill) {
      localPath = toDisplayPath(buildLocalSkillPath(root, skill, skillsRoot), root)
    }

    const target = resolveSkillDirectory(root, localPath)
    if (!target || !fs.existsSync(target)) {
      return { ok: false, error: '目录不存在，请先安装 Skill' }
    }

    const err = await shell.openPath(target)
    if (err) {
      // macOS 兜底：用 open 命令打开 Finder
      if (process.platform === 'darwin') {
        const { execFile } = require('child_process')
        await new Promise((resolve) => {
          execFile('open', [target], () => resolve(undefined))
        })
        return { ok: true, path: target, localPath: toDisplayPath(target, root) }
      }
      return { ok: false, error: err, path: target }
    }
    return { ok: true, path: target, localPath: toDisplayPath(target, root) }
  })

  safeHandle('dialog:confirm', async (_event, payload) => {
    const { title, message, detail } = payload || {}
    const result = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['取消', '确认'],
      defaultId: 1,
      cancelId: 0,
      title: title || '确认',
      message: message || '',
      detail: detail || '',
    })
    return result.response === 1
  })

  safeHandle('dialog:restartPrompt', async (_event, payload) => {
    const { title, message, detail } = payload || {}
    const result = await dialog.showMessageBox({
      type: 'info',
      buttons: ['稍后重启', '立即重启'],
      defaultId: 1,
      cancelId: 0,
      title: title || '需要重启',
      message: message || '修改将在重启后生效',
      detail: detail || '',
    })
    return result.response === 1 ? 'relaunch' : 'later'
  })

  safeHandle('dialog:openDirectory', async (_event, payload) => {
    const result = await dialog.showOpenDialog({
      title: payload?.title || '选择文件夹',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: payload?.defaultPath,
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  safeHandle('app:relaunch', async () => {
    const { app } = require('electron')
    app.relaunch()
    app.exit(0)
    return { ok: true }
  })

  safeHandle('app:getPaths', async () => {
    const { app } = require('electron')
    refreshSkillsRootFromDisk()
    fs.mkdirSync(dataRoot, { recursive: true })
    fs.mkdirSync(skillsRoot, { recursive: true })
    const defaultRoot = getDefaultSkillsRoot(root)
    const programPath = app.getPath('exe')
    const userDataPath = app.getPath('userData')
    return {
      ok: true,
      dataRoot,
      dataRootDisplay: toDisplayPath(dataRoot, root),
      skillsRoot,
      skillsRootDisplay: toDisplayPath(skillsRoot, root),
      skillsRootDefault: defaultRoot,
      skillsRootDefaultDisplay: toDisplayPath(defaultRoot, root),
      stateFile: path.join(dataRoot, 'ui-state.json'),
      stateFileDisplay: toDisplayPath(path.join(dataRoot, 'ui-state.json'), root),
      programPath,
      programPathDisplay: toDisplayPath(programPath, root),
      userDataPath,
      userDataPathDisplay: toDisplayPath(userDataPath, root),
    }
  })

  safeHandle('app:getVersionInfo', async () => appUpdater.getVersionInfo())
  safeHandle('app:checkUpdate', async (_event, payload) => appUpdater.checkForUpdates(payload || {}))
  safeHandle('app:downloadUpdate', async (_event, payload) => appUpdater.downloadUpdate(payload || {}))
  safeHandle('app:installUpdate', async () => appUpdater.installUpdate())
  safeHandle('app:rollbackUpdate', async () => appUpdater.rollback())
  safeHandle('app:setUpdateFeedUrl', async (_event, payload) =>
    appUpdater.setFeedUrl(payload?.url || ''),
  )
  safeHandle('app:getPendingApplyStatus', async () => pendingApply)

  safeHandle('app:setSkillsRoot', async (_event, payload) => {
    const validated = validateAgentSkillPath(payload?.path, root)
    if (!validated.ok) return validated
    writeJson(skillsRootFile, {
      path: validated.displayPath || validated.path,
      updatedAt: new Date().toISOString(),
    })
    // Do not switch in-memory root until relaunch — keeps current session consistent.
    return {
      ok: true,
      path: validated.path,
      displayPath: validated.displayPath,
      restartRequired: true,
    }
  })

  safeHandle('sources:testConnection', async (_event, payload) => {
    return registry.testConnection(payload || {})
  })

  safeHandle('sources:listSkills', async (_event, payload) => {
    return registry.listSkills(payload || {})
  })

  safeHandle('auth:login', async (_event, payload) => skillhubAuth.login(payload || {}))
  safeHandle('auth:logout', async (_event, payload) => skillhubAuth.logout(payload || {}))
  safeHandle('auth:me', async (_event, payload) => skillhubAuth.me(payload || {}))
  safeHandle('auth:myNamespaces', async (_event, payload) => skillhubAuth.myNamespaces(payload || {}))

  safeHandle('skills:packZip', async (_event, payload) => {
    return packSkillZip({ homeDir: homeDir || os.homedir(), ...(payload || {}) })
  })

  safeHandle('skills:preparePublish', async (_event, payload) => {
    return publishPipeline.preparePublishFromZip(payload || {})
  })

  safeHandle('skills:finalizePublish', async (_event, payload) => {
    return publishPipeline.finalizePublishSession(payload || {})
  })

  safeHandle('skills:cleanupPublish', async (_event, payload) => {
    return publishPipeline.cleanupPublishSession(payload?.sessionDir || payload?.sessionId)
  })

  safeHandle('hub:publish', async (_event, payload) => {
    const result = await skillhubPublish.publishSkill(payload || {})
    if (payload?.tmpDir) cleanupPack(payload.tmpDir)
    if (payload?.sessionDir) publishPipeline.cleanupPublishSession(payload.sessionDir)
    return result
  })

  safeHandle('hub:withdrawReview', async (_event, payload) => {
    return skillhubPublish.withdrawReview(payload || {})
  })

  safeHandle('hub:deleteSkill', async (_event, payload) => {
    return skillhubPublish.deleteSkill(payload || {})
  })

  safeHandle('hub:getSkillVersionStatus', async (_event, payload) => {
    return skillhubPublish.getSkillVersionStatus(payload || {})
  })

  safeHandle('app:getDiskSpace', async (_event, payload) => {
    refreshSkillsRootFromDisk()
    const target =
      (payload?.path && String(payload.path).trim()) ||
      skillsRoot ||
      getDefaultSkillsRoot(root)
    const expanded = expandPath(target, root) || target
    try {
      return getDiskSpace(expanded)
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : '磁盘容量查询失败',
        path: expanded,
      }
    }
  })

  safeHandle('logs:getInfo', async () => {
    try {
      if (!appLog.getLogInfo().logsDir) {
        appLog.initAppLog(dataRoot)
      }
      return {
        ...appLog.getLogInfo(root),
        dataRoot,
        dataRootDisplay: toDisplayPath(dataRoot, root),
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : '读取日志信息失败',
        dataRoot,
        dataRootDisplay: toDisplayPath(dataRoot, root),
      }
    }
  })

  safeHandle('logs:append', async (_event, payload) => {
    try {
      const level = payload?.level || 'info'
      const message = payload?.message || ''
      if (!message) return { ok: false, error: '缺少日志内容' }
      return appLog.write(level, message, payload?.meta)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '写日志失败' }
    }
  })

  safeHandle('logs:purge', async () => {
    try {
      return appLog.purgeOldLogs()
    } catch (error) {
      return { ok: false, removed: [], error: error instanceof Error ? error.message : '清理日志失败' }
    }
  })

  safeHandle('logs:openDir', async () => {
    try {
      let info = appLog.getLogInfo(root)
      if (!info.logsDir) {
        appLog.initAppLog(dataRoot)
        info = appLog.getLogInfo(root)
      }
      if (!info.logsDir) return { ok: false, error: '日志目录不存在' }
      fs.mkdirSync(info.logsDir, { recursive: true })
      const { shell } = require('electron')
      const err = await shell.openPath(info.logsDir)
      return { ok: !err, error: err || undefined, path: info.logsDir, pathDisplay: info.logsDirDisplay }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '打开日志目录失败' }
    }
  })

  console.log('[Nexus] IPC ready: app update, disk space, logs')
}

module.exports = { registerIpc, safeHandle }
