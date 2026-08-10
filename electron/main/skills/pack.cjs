const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { expandPath, ensureSkillPackage } = require('./sync.cjs')

const execFileAsync = promisify(execFile)

function slugifyName(name) {
  return (
    String(name || 'skill')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'skill'
  )
}

function ensureFrontmatter(skillDir, skillMeta) {
  const skillMd = path.join(skillDir, 'SKILL.md')
  const name = skillMeta.name || skillMeta.skillId || 'skill'
  const description = skillMeta.description || ''
  const version = skillMeta.version || '1.0.0'
  const bodyFallback = `# ${name}\n\n${description}\n`
  let body = bodyFallback
  if (fs.existsSync(skillMd)) {
    const raw = fs.readFileSync(skillMd, 'utf8')
    if (raw.startsWith('---')) {
      const end = raw.indexOf('\n---', 3)
      body = end >= 0 ? raw.slice(end + 4).replace(/^\n/, '') : bodyFallback
    } else {
      body = raw.trim() ? raw : bodyFallback
    }
  }
  const content = `---\nname: ${name}\ndescription: ${String(description).replace(/\n/g, ' ')}\nversion: ${version}\n---\n\n${body.trim()}\n`
  fs.writeFileSync(skillMd, content, 'utf8')
  return { name, description, version, slugHint: slugifyName(skillMeta.skillId || name) }
}

async function zipDirectory(dir, outZip) {
  if (fs.existsSync(outZip)) fs.rmSync(outZip, { force: true })
  if (process.platform === 'win32') {
    const ps = `Compress-Archive -Path (Join-Path -Path '${dir.replace(/'/g, "''")}' -ChildPath '*') -DestinationPath '${outZip.replace(/'/g, "''")}' -Force`
    await execFileAsync('powershell.exe', ['-NoProfile', '-Command', ps])
  } else {
    await execFileAsync('zip', ['-r', '-q', outZip, '.'], { cwd: dir })
  }
  if (!fs.existsSync(outZip)) throw new Error('打包 zip 失败')
}

/**
 * Ensure SkillHub-compatible SKILL.md frontmatter, then zip skill directory.
 */
async function packSkillZip({ homeDir, skill, version } = {}) {
  try {
    if (!skill) return { ok: false, error: '缺少 Skill' }
    const root = homeDir || os.homedir()
    let dir = expandPath(skill.localPath, root)
    if (!dir || !fs.existsSync(dir)) {
      return { ok: false, error: 'Skill 本地目录不存在，请先在「我的」中打开确认' }
    }
    if (fs.statSync(dir).isFile()) dir = path.dirname(dir)

    const meta = {
      ...skill,
      version: version || skill.version || '1.0.0',
      origin: skill.origin || 'created',
    }
    if (!meta.content) {
      const skillMd = path.join(dir, 'SKILL.md')
      if (fs.existsSync(skillMd)) meta.content = fs.readFileSync(skillMd, 'utf8')
    }
    const written = ensureSkillPackage(dir, meta)
    if (!written.ok) return { ok: false, error: written.error || '打包前写入失败' }
    const fm = ensureFrontmatter(dir, meta)

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-publish-'))
    const zipPath = path.join(tmpDir, `${fm.slugHint || 'skill'}-${fm.version}.zip`)
    await zipDirectory(dir, zipPath)
    return { ok: true, zipPath, version: fm.version, name: fm.name, tmpDir }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '打包失败' }
  }
}

function cleanupPack(tmpDir) {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

module.exports = {
  packSkillZip,
  cleanupPack,
  ensureFrontmatter,
  slugifyName,
}
