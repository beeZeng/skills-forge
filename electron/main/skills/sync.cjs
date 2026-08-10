const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

function expandPath(input, homeDir = os.homedir()) {
  if (!input || typeof input !== 'string') return ''
  if (input === '~') return homeDir
  // Accept both ~/ and ~\ (Windows display paths often use backslash)
  if (input.startsWith('~/') || input.startsWith('~\\')) {
    return path.join(homeDir, input.slice(2).replace(/^[\\/]+/, ''))
  }
  return input
}

function toDisplayPath(absPath, homeDir = os.homedir()) {
  if (!absPath) return ''
  // Normalize for reliable prefix match on Windows
  const abs = path.normalize(absPath)
  const home = path.normalize(homeDir)
  if (abs === home) return '~'
  const prefix = home.endsWith(path.sep) ? home : home + path.sep
  if (abs.startsWith(prefix) || abs.toLowerCase().startsWith(prefix.toLowerCase())) {
    const rest = abs.slice(home.length).replace(/\\/g, '/')
    return rest.startsWith('/') ? `~${rest}` : `~/${rest}`
  }
  return abs
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

function isLocalOrigin(skillMeta = {}) {
  return (
    skillMeta.origin === 'created' ||
    skillMeta.origin === 'imported' ||
    skillMeta.sourceId === 'local' ||
    skillMeta.sourceId === 'offline'
  )
}

function buildStubMarkdown(skillMeta = {}) {
  return `# ${skillMeta.name || 'Skill'}\n\n${skillMeta.description || ''}\n\n- Version: ${skillMeta.version || ''}\n- Source: ${skillMeta.sourceName || skillMeta.sourceId || ''}\n`
}

/** Detect name+简介 placeholder packages (cross-platform text compare). */
function isStubSkillMarkdown(text, skillMeta = {}) {
  if (!text || typeof text !== 'string') return true
  const trimmed = text.trim()
  if (!trimmed) return true
  const stub = buildStubMarkdown(skillMeta).trim()
  if (trimmed === stub) return true
  // Classic stub shape: single H1 + short description + Version/Source bullets, no frontmatter
  const hasFrontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(trimmed)
  if (hasFrontmatter) return false
  const lines = trimmed.split(/\r?\n/)
  if (
    lines.length <= 8 &&
    /^#\s+/.test(lines[0] || '') &&
    /^- Version:/m.test(trimmed) &&
    /^- Source:/m.test(trimmed)
  ) {
    return true
  }
  const desc = String(skillMeta.description || '').trim()
  if (desc && trimmed === desc) return true
  if (
    !hasFrontmatter &&
    trimmed.length < 80 &&
    desc &&
    trimmed.includes(desc.slice(0, Math.min(40, desc.length)))
  ) {
    return true
  }
  return false
}

function listPackageFiles(dir, prefix = '', acc = []) {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) listPackageFiles(full, rel.replace(/\\/g, '/'), acc)
    else if (entry.isFile()) acc.push(rel.replace(/\\/g, '/'))
  }
  return acc
}

function hashPackageDir(dir) {
  const files = listPackageFiles(dir)
    .filter((rel) => !/(^|\/)skill\.json$/i.test(rel))
    .sort()
  const hash = crypto.createHash('sha256')
  for (const rel of files) {
    hash.update(rel)
    hash.update('\0')
    hash.update(fs.readFileSync(path.join(dir, ...rel.split('/'))))
    hash.update('\0')
  }
  return hash.digest('hex')
}

/**
 * Write skill package. Catalog skills require non-stub content.
 * @returns {{ ok: boolean, contentHash?: string, isStub?: boolean, error?: string }}
 */
function ensureSkillPackage(skillPath, skillMeta = {}) {
  fs.mkdirSync(skillPath, { recursive: true })
  const skillMd = path.join(skillPath, 'SKILL.md')
  const local = isLocalOrigin(skillMeta)
  const provided =
    typeof skillMeta.content === 'string' && skillMeta.content.trim() ? skillMeta.content : ''
  const stub = buildStubMarkdown(skillMeta)

  if (!local) {
    if (!provided || isStubSkillMarkdown(provided, skillMeta)) {
      return {
        ok: false,
        error: '缺少完整 Skill 内容，拒绝写入简介占位包',
        isStub: true,
      }
    }
  }

  const content = provided || stub
  if (!fs.existsSync(skillMd) || provided) {
    fs.writeFileSync(skillMd, content, 'utf8')
  }

  if (Array.isArray(skillMeta.files)) {
    for (const file of skillMeta.files) {
      if (!file?.relativePath) continue
      const rel = String(file.relativePath).replace(/\\/g, '/').replace(/^\/+/, '')
      if (!rel || rel.includes('..') || /^SKILL\.md$/i.test(rel)) continue
      const dest = path.join(skillPath, ...rel.split('/'))
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      if (Buffer.isBuffer(file.content)) fs.writeFileSync(dest, file.content)
      else fs.writeFileSync(dest, String(file.content ?? ''), 'utf8')
    }
  }

  const contentHash = hashPackageDir(skillPath)
  const isStub = isStubSkillMarkdown(
    fs.existsSync(skillMd) ? fs.readFileSync(skillMd, 'utf8') : content,
    skillMeta,
  )

  const manifest = path.join(skillPath, 'skill.json')
  fs.writeFileSync(
    manifest,
    JSON.stringify(
      {
        name: skillMeta.name,
        skillId: skillMeta.skillId,
        version: skillMeta.version,
        sourceId: skillMeta.sourceId,
        namespace: skillMeta.namespace || 'default',
        homepageUrl: skillMeta.homepageUrl,
        packageSource: skillMeta.packageSource,
        contentSource: skillMeta.contentSource,
        contentHash,
        installedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  )

  return { ok: true, contentHash, isStub }
}

function verifySkillPackage(homeDir, payload = {}) {
  const resolved = expandPath(payload.localPath, homeDir || os.homedir())
  if (!resolved) {
    return { ok: false, exists: false, error: '本地路径无效' }
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return { ok: false, exists: false, error: '本地 Skill 包不存在' }
  }
  const skillMd = path.join(resolved, 'SKILL.md')
  if (!fs.existsSync(skillMd)) {
    return { ok: false, exists: false, error: '缺少 SKILL.md' }
  }
  let manifest = null
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(resolved, 'skill.json'), 'utf8'))
  } catch {
    manifest = null
  }
  const text = fs.readFileSync(skillMd, 'utf8')
  const meta = {
    name: payload.name || manifest?.name,
    description: payload.description,
    version: payload.version || manifest?.version,
    sourceId: payload.sourceId || manifest?.sourceId,
    sourceName: payload.sourceName,
  }
  const isStub = isStubSkillMarkdown(text, meta)
  const contentHash = hashPackageDir(resolved)
  const expected = payload.contentHash || manifest?.contentHash
  const hashMatches = expected ? expected === contentHash : !isStub
  const ok = !isStub && hashMatches
  return {
    ok,
    exists: true,
    isStub,
    contentHash,
    expectedHash: expected || undefined,
    hashMatches,
    error: ok ? undefined : isStub ? '本地包仅为简介占位' : '本地包 hash 不匹配或已损坏',
  }
}

function buildLocalSkillPath(homeDir, skill, skillsRoot) {
  const version = skill.version || skill.latestVersion || '1.0.0'
  const root = skillsRoot || path.join(homeDir, '.skillmesh')
  // Sanitize path segments for Windows reserved names / illegal chars
  const safe = (part) =>
    String(part || 'default')
      .replace(/[<>:"|?*\u0000-\u001f]/g, '_')
      .replace(/[\\/]+/g, '_')
      .trim() || 'default'
  return path.join(
    root,
    'skills',
    safe(skill.sourceId),
    safe(skill.namespace || 'default'),
    safe(skill.skillId),
    safe(version),
  )
}

function getDefaultSkillsRoot(homeDir = os.homedir()) {
  return path.join(homeDir, '.skillmesh')
}

function resolveSkillsRoot(homeDir, configured) {
  if (configured && typeof configured === 'string' && configured.trim()) {
    const expanded = expandPath(configured.trim(), homeDir)
    if (expanded) return path.normalize(expanded)
  }
  return getDefaultSkillsRoot(homeDir)
}

function linkSkillToAgent({ homeDir, skill, agentSkillPath }) {
  if (!agentSkillPath) return { ok: false, error: '智能体 Skill 目录未知' }
  const src = expandPath(skill.localPath, homeDir)
  if (!src) return { ok: false, error: 'Skill 本地路径无效' }
  if (!fs.existsSync(src)) {
    return { ok: false, error: '本地 Skill 包不存在，请重新安装后再同步' }
  }
  const skillMd = path.join(src, 'SKILL.md')
  if (!fs.existsSync(skillMd) || isStubSkillMarkdown(fs.readFileSync(skillMd, 'utf8'), skill)) {
    return { ok: false, error: '本地 Skill 内容不完整（仅有简介），请重新安装后再同步' }
  }
  const agentDir = expandPath(agentSkillPath, homeDir)
  fs.mkdirSync(agentDir, { recursive: true })
  const dest = path.join(agentDir, String(skill.skillId || 'skill').replace(/[<>:"|?*\\/]/g, '_'))
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
  copyDirSync(src, dest)
  return { ok: true, destPath: dest }
}

function unlinkSkillFromAgent({ homeDir, skill, agentSkillPath }) {
  if (!agentSkillPath) return { ok: false, error: '智能体 Skill 目录未知' }
  const agentDir = expandPath(agentSkillPath, homeDir || os.homedir())
  const dest = path.join(agentDir, String(skill.skillId || 'skill').replace(/[<>:"|?*\\/]/g, '_'))
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

const WIN_RESERVED = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
])

/** Validate an agent skills directory path before saving overrides. */
function validateAgentSkillPath(input, homeDir = os.homedir()) {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) return { ok: false, error: '路径不能为空' }
  if (raw.includes('\0')) return { ok: false, error: '路径包含非法空字符' }
  if (/[\r\n\t]/.test(raw)) return { ok: false, error: '路径不能包含换行或制表符' }

  const looksHome = raw === '~' || raw.startsWith('~/') || raw.startsWith('~\\')
  const looksAbs =
    path.isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith('\\\\')
  if (!looksHome && !looksAbs) {
    return { ok: false, error: '请使用绝对路径或以 ~ 开头的路径' }
  }

  let resolved = expandPath(raw, homeDir)
  if (!resolved) return { ok: false, error: '路径无效' }
  resolved = path.normalize(resolved)

  if (!path.isAbsolute(resolved)) {
    return { ok: false, error: '解析后的路径不是绝对路径' }
  }

  const parts = resolved.split(path.sep).filter(Boolean)
  for (const part of parts) {
    const base = part.replace(/\.[^.]+$/, '')
    if (process.platform === 'win32' && WIN_RESERVED.has(base.toUpperCase())) {
      return { ok: false, error: `路径包含 Windows 保留名：${part}` }
    }
  }

  try {
    if (fs.existsSync(resolved)) {
      if (!fs.statSync(resolved).isDirectory()) {
        return { ok: false, error: '路径已存在且不是目录' }
      }
    } else {
      const parent = path.dirname(resolved)
      if (!parent || parent === resolved || !fs.existsSync(parent)) {
        return { ok: false, error: '目录不存在，且上级目录也不存在' }
      }
      if (!fs.statSync(parent).isDirectory()) {
        return { ok: false, error: '上级路径不是目录' }
      }
    }
  } catch (err) {
    return { ok: false, error: err?.message || '无法访问该路径' }
  }

  return {
    ok: true,
    path: resolved,
    displayPath: toDisplayPath(resolved, homeDir),
  }
}

function readSkillMarkdown(homeDir, payload = {}, skillsRoot) {
  const root = homeDir || os.homedir()
  const skill = payload.skill
  let localPath = payload.localPath
  const resolvedSkillsRoot = resolveSkillsRoot(root, skillsRoot)

  if (!localPath && skill) {
    localPath =
      skill.localPath || toDisplayPath(buildLocalSkillPath(root, skill, resolvedSkillsRoot), root)
  }
  if (!localPath && !skill) {
    return { ok: false, error: '缺少 Skill 信息' }
  }

  const dir = resolveSkillDirectory(root, localPath)
  if (!dir || !fs.existsSync(dir)) {
    return { ok: false, error: 'Skill 目录不存在，请先安装' }
  }

  const candidates = ['SKILL.md', 'skill.md', 'README.md', 'readme.md']
  for (const name of candidates) {
    const file = path.join(dir, name)
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const content = fs.readFileSync(file, 'utf8')
      return {
        ok: true,
        content,
        fileName: name,
        path: file,
        displayPath: toDisplayPath(file, root),
        isStub: isStubSkillMarkdown(content, skill || {}),
      }
    }
  }

  return { ok: false, error: '未找到可预览的 Markdown 文件（SKILL.md / README.md）' }
}

module.exports = {
  expandPath,
  toDisplayPath,
  ensureSkillPackage,
  buildLocalSkillPath,
  getDefaultSkillsRoot,
  resolveSkillsRoot,
  linkSkillToAgent,
  unlinkSkillFromAgent,
  resolveSkillDirectory,
  removeSkillPackage,
  validateAgentSkillPath,
  readSkillMarkdown,
  copyDirSync,
  hashPackageDir,
  verifySkillPackage,
  isStubSkillMarkdown,
  isLocalOrigin,
  buildStubMarkdown,
}
