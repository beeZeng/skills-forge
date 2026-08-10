const fs = require('fs')
const path = require('path')
const os = require('os')

function expandPath(input, homeDir = os.homedir()) {
  if (!input || typeof input !== 'string') return ''
  if (input.startsWith('~/')) return path.join(homeDir, input.slice(2))
  if (input === '~') return homeDir
  return input
}

function toDisplayPath(absPath, homeDir = os.homedir()) {
  if (!absPath) return ''
  if (absPath.startsWith(homeDir)) return `~${absPath.slice(homeDir.length)}`
  return absPath
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDirSync(srcPath, destPath)
    else fs.copyFileSync(srcPath, destPath)
  }
}

function ensureSkillPackage(skillPath, skillMeta) {
  fs.mkdirSync(skillPath, { recursive: true })
  const skillMd = path.join(skillPath, 'SKILL.md')
  const defaultMd = `# ${skillMeta.name}\n\n${skillMeta.description || ''}\n\n- Version: ${skillMeta.version}\n- Source: ${skillMeta.sourceName || skillMeta.sourceId}\n`
  const content = typeof skillMeta.content === 'string' && skillMeta.content.trim()
    ? skillMeta.content
    : defaultMd
  if (!fs.existsSync(skillMd) || (typeof skillMeta.content === 'string' && skillMeta.content.trim())) {
    fs.writeFileSync(skillMd, content, 'utf8')
  }
  const manifest = path.join(skillPath, 'skill.json')
  if (!fs.existsSync(manifest)) {
    fs.writeFileSync(
      manifest,
      JSON.stringify(
        {
          name: skillMeta.name,
          skillId: skillMeta.skillId,
          version: skillMeta.version,
          sourceId: skillMeta.sourceId,
          namespace: skillMeta.namespace || 'default',
        },
        null,
        2,
      ),
      'utf8',
    )
  }
}

function buildLocalSkillPath(homeDir, skill) {
  const version = skill.version || skill.latestVersion || '1.0.0'
  return path.join(
    homeDir,
    '.skillmesh',
    'skills',
    skill.sourceId,
    skill.namespace || 'default',
    skill.skillId,
    version,
  )
}

function linkSkillToAgent({ homeDir, skill, agentSkillPath }) {
  if (!agentSkillPath) return { ok: false, error: '智能体 Skill 目录未知' }
  const src = expandPath(skill.localPath, homeDir)
  if (!src) return { ok: false, error: 'Skill 本地路径无效' }
  if (!fs.existsSync(src)) {
    ensureSkillPackage(src, skill)
  }
  const agentDir = expandPath(agentSkillPath, homeDir)
  fs.mkdirSync(agentDir, { recursive: true })
  const dest = path.join(agentDir, skill.skillId)
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
  copyDirSync(src, dest)
  return { ok: true, destPath: dest }
}

function unlinkSkillFromAgent({ homeDir, skill, agentSkillPath }) {
  if (!agentSkillPath) return { ok: false, error: '智能体 Skill 目录未知' }
  const agentDir = expandPath(agentSkillPath, homeDir || os.homedir())
  const dest = path.join(agentDir, skill.skillId)
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
  return { ok: true }
}

function resolveSkillDirectory(homeDir, localPath) {
  const resolved = expandPath(localPath, homeDir)
  if (!resolved) return ''
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return path.dirname(resolved)
  }
  return resolved
}

function removeSkillPackage(homeDir, localPath) {
  const resolved = expandPath(localPath, homeDir)
  if (resolved && fs.existsSync(resolved)) {
    fs.rmSync(resolved, { recursive: true, force: true })
  }
  return { ok: true }
}

module.exports = {
  expandPath,
  toDisplayPath,
  ensureSkillPackage,
  buildLocalSkillPath,
  linkSkillToAgent,
  unlinkSkillFromAgent,
  resolveSkillDirectory,
  removeSkillPackage,
  copyDirSync,
}
