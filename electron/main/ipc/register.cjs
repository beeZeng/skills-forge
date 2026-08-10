const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')
const {
  buildLocalSkillPath,
  ensureSkillPackage,
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
} = require('../skills/sync.cjs')
const registry = require('../registry/index.cjs')
const skillhubAuth = require('../registry/skillhub-auth.cjs')
const skillhubPublish = require('../registry/skillhub-publish.cjs')
const { packSkillZip, cleanupPack } = require('../skills/pack.cjs')
const { fetchSkillPackageContent } = require('../skills/fetch-content.cjs')
const { getDiskSpace } = require('../fs/disk-space.cjs')
const appLog = require('../logging/app-log.cjs')

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

  const refreshSkillsRootFromDisk = () => {
    const saved = readJson(skillsRootFile, null)
    skillsRoot = resolveSkillsRoot(root, saved?.path)
    return skillsRoot
  }

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

    const local = isLocalOrigin(skill)
    let content = typeof skill.content === 'string' ? skill.content : undefined
    let files
    let contentSource

    const existingMd = path.join(preferred, 'SKILL.md')
    let existingText = ''
    try {
      if (fs.existsSync(existingMd)) existingText = fs.readFileSync(existingMd, 'utf8')
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

    if (!needsFetch && hasGoodExisting && !hasGoodInline) {
      const verified = verifySkillPackage(root, {
        localPath: toDisplayPath(preferred, root),
        contentHash: skill.contentHash,
        name: skill.name,
        description: skill.description,
        version: skill.version,
        sourceId: skill.sourceId,
        sourceName: skill.sourceName,
      })
      // Re-hash / refresh manifest without re-download
      const written = ensureSkillPackage(preferred, {
        ...skill,
        content: existingText,
        contentSource: skill.contentSource || 'existing',
        origin: local ? skill.origin || 'created' : skill.origin,
      })
      if (!written.ok) {
        return { ok: false, error: written.error || '本地包校验失败', localPath: toDisplayPath(preferred, root) }
      }
      return {
        ok: true,
        localPath: toDisplayPath(preferred, root),
        contentFetched: false,
        contentSource: skill.contentSource || 'existing',
        contentHash: written.contentHash || verified.contentHash,
      }
    }

    if (needsFetch) {
      // Do not reuse stale inline stub/description as package body
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

    const written = ensureSkillPackage(preferred, {
      ...skill,
      content,
      files,
      contentSource,
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
    return {
      ok: true,
      localPath: toDisplayPath(preferred, root),
      contentFetched: Boolean(content && content.trim()),
      contentSource,
      contentHash: written.contentHash,
    }
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

  safeHandle('skills:removePackage', async (_event, localPath) => {
    removeSkillPackage(homeDir || os.homedir(), localPath)
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
    refreshSkillsRootFromDisk()
    fs.mkdirSync(dataRoot, { recursive: true })
    fs.mkdirSync(skillsRoot, { recursive: true })
    const defaultRoot = getDefaultSkillsRoot(root)
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
    }
  })

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

  safeHandle('hub:publish', async (_event, payload) => {
    const result = await skillhubPublish.publishSkill(payload || {})
    if (payload?.tmpDir) cleanupPack(payload.tmpDir)
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

  console.log('[Nexus] IPC ready: app:getDiskSpace, logs:getInfo/append/purge/openDir')
}

module.exports = { registerIpc, safeHandle }
