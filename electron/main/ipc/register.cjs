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
} = require('../skills/sync.cjs')
const registry = require('../registry/index.cjs')
const skillhubAuth = require('../registry/skillhub-auth.cjs')
const skillhubPublish = require('../registry/skillhub-publish.cjs')
const { packSkillZip, cleanupPack } = require('../skills/pack.cjs')

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

function detectAgents(homeDir) {
  const candidates = [
    {
      id: 'cursor',
      type: 'cursor',
      name: 'Cursor',
      appPaths: [
        '/Applications/Cursor.app',
        path.join(homeDir, 'Applications/Cursor.app'),
      ],
      skillPath: path.join(homeDir, '.cursor/skills'),
    },
    {
      id: 'claude-code',
      type: 'claude-code',
      name: 'Claude Code',
      appPaths: [],
      skillPath: path.join(homeDir, '.claude/skills'),
    },
    {
      id: 'codex',
      type: 'codex',
      name: 'Codex',
      appPaths: [],
      skillPath: path.join(homeDir, '.codex/skills'),
    },
    {
      id: 'piagent',
      type: 'piagent',
      name: 'PiAgent',
      appPaths: [],
      skillPath: path.join(homeDir, '.pi/skills'),
    },
    {
      id: 'qoder',
      type: 'qoder',
      name: 'Qoder',
      appPaths: ['/Applications/Qoder.app'],
      skillPath: path.join(homeDir, '.qoder/skills'),
    },
    {
      id: 'trae',
      type: 'trae',
      name: 'Trae',
      appPaths: ['/Applications/Trae.app'],
      skillPath: path.join(homeDir, '.trae/skills'),
    },
    {
      id: 'opencode',
      type: 'opencode',
      name: 'OpenCode',
      appPaths: [],
      skillPath: path.join(homeDir, '.opencode/skills'),
    },
  ]

  const now = new Date().toISOString()
  return candidates.map((item) => {
    const appFound = item.appPaths.some((p) => fs.existsSync(p))
    const skillDirExists = fs.existsSync(item.skillPath)
    const installed = appFound || skillDirExists
    return {
      id: item.id,
      type: item.type,
      name: item.name,
      installed,
      executablePath: item.appPaths.find((p) => fs.existsSync(p)),
      skillPath: item.skillPath,
      defaultSkillPath: item.skillPath,
      lastDetectedAt: now,
    }
  })
}

function registerIpc({ dataRoot, homeDir }) {
  const stateFile = path.join(dataRoot, 'ui-state.json')
  ipcMain.handle('storage:loadState', async () => readJson(stateFile, null))
  ipcMain.handle('storage:saveState', async (_event, state) => {
    writeJson(stateFile, state ?? {})
    return { ok: true }
  })


  ipcMain.handle('agents:scan', async () => detectAgents(homeDir || os.homedir()))

  ipcMain.handle('agents:syncSkill', async (_event, payload) => {
    const { action, skill, agentSkillPath } = payload || {}
    if (!skill || !agentSkillPath) {
      return { ok: false, error: '缺少 Skill 或智能体目录' }
    }
    const root = homeDir || os.homedir()
    if (action === 'link') return linkSkillToAgent({ homeDir: root, skill, agentSkillPath })
    if (action === 'unlink') return unlinkSkillFromAgent({ homeDir: root, skill, agentSkillPath })
    return { ok: false, error: '未知同步操作' }
  })

  ipcMain.handle('skills:ensurePackage', async (_event, skill) => {
    if (!skill) return { ok: false, error: '缺少 Skill 信息' }
    const root = homeDir || os.homedir()
    const preferred = skill.localPath
      ? (skill.localPath.startsWith('~/')
          ? path.join(root, skill.localPath.slice(2))
          : skill.localPath)
      : buildLocalSkillPath(root, skill)
    ensureSkillPackage(preferred, {
      ...skill,
      content: skill.content,
    })
    return { ok: true, localPath: toDisplayPath(preferred, root) }
  })

  ipcMain.handle('skills:removePackage', async (_event, localPath) => {
    removeSkillPackage(homeDir || os.homedir(), localPath)
    return { ok: true }
  })

  ipcMain.handle('shell:openSkillDir', async (_event, payload) => {
    const root = homeDir || os.homedir()
    const { shell } = require('electron')
    const input = typeof payload === 'string' ? { localPath: payload } : payload || {}
    let localPath = input.localPath
    const skill = input.skill

    if (!localPath && skill) {
      localPath = toDisplayPath(buildLocalSkillPath(root, skill), root)
    }

    let target = resolveSkillDirectory(root, localPath)
    if (!target || !fs.existsSync(target)) {
      if (skill) {
        target = buildLocalSkillPath(root, skill)
        ensureSkillPackage(target, skill)
      } else {
        return { ok: false, error: '目录不存在，请先安装 Skill' }
      }
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

  ipcMain.handle('dialog:confirm', async (_event, payload) => {
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

  ipcMain.handle('dialog:restartPrompt', async (_event, payload) => {
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

  ipcMain.handle('dialog:openDirectory', async (_event, payload) => {
    const result = await dialog.showOpenDialog({
      title: payload?.title || '选择文件夹',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: payload?.defaultPath,
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('app:relaunch', async () => {
    const { app } = require('electron')
    app.relaunch()
    app.exit(0)
    return { ok: true }
  })

  ipcMain.handle('app:getPaths', async () => {
    const root = homeDir || os.homedir()
    const skillsRoot = path.join(root, '.skillmesh')
    fs.mkdirSync(dataRoot, { recursive: true })
    fs.mkdirSync(skillsRoot, { recursive: true })
    return {
      ok: true,
      dataRoot,
      dataRootDisplay: toDisplayPath(dataRoot, root),
      skillsRoot,
      skillsRootDisplay: toDisplayPath(skillsRoot, root),
      stateFile: path.join(dataRoot, 'ui-state.json'),
      stateFileDisplay: toDisplayPath(path.join(dataRoot, 'ui-state.json'), root),
    }
  })

  ipcMain.handle('sources:testConnection', async (_event, payload) => {
    return registry.testConnection(payload || {})
  })

  ipcMain.handle('sources:listSkills', async (_event, payload) => {
    return registry.listSkills(payload || {})
  })

  ipcMain.handle('auth:login', async (_event, payload) => skillhubAuth.login(payload || {}))
  ipcMain.handle('auth:logout', async (_event, payload) => skillhubAuth.logout(payload || {}))
  ipcMain.handle('auth:me', async (_event, payload) => skillhubAuth.me(payload || {}))
  ipcMain.handle('auth:myNamespaces', async (_event, payload) => skillhubAuth.myNamespaces(payload || {}))

  ipcMain.handle('skills:packZip', async (_event, payload) => {
    return packSkillZip({ homeDir: homeDir || os.homedir(), ...(payload || {}) })
  })

  ipcMain.handle('hub:publish', async (_event, payload) => {
    const result = await skillhubPublish.publishSkill(payload || {})
    if (payload?.tmpDir) cleanupPack(payload.tmpDir)
    return result
  })

  ipcMain.handle('hub:withdrawReview', async (_event, payload) => {
    return skillhubPublish.withdrawReview(payload || {})
  })

  ipcMain.handle('hub:deleteSkill', async (_event, payload) => {
    return skillhubPublish.deleteSkill(payload || {})
  })

  ipcMain.handle('hub:getSkillVersionStatus', async (_event, payload) => {
    return skillhubPublish.getSkillVersionStatus(payload || {})
  })
}

module.exports = { registerIpc }
