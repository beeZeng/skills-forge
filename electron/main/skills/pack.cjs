const fs = require('fs')
const path = require('path')
const os = require('os')
const { expandPath, ensureSkillPackage, toDisplayPath } = require('./sync.cjs')
const { zipDirectory } = require('./zip-fs.cjs')
const { normalizeSkillPackage } = require('./normalize-package.cjs')
const { slugifySkillName } = require('./manifest.cjs')

function ensureFrontmatter(skillDir, skillMeta) {
  const skillMd = path.join(skillDir, 'skill.md')
  const skillMdAlt = path.join(skillDir, 'SKILL.md')
  const target = fs.existsSync(skillMd) ? skillMd : skillMdAlt
  const name = skillMeta.name || skillMeta.skillId || 'skill'
  const description = skillMeta.description || ''
  const version = skillMeta.version || '1.0.0'
  const bodyFallback = `# ${name}\n\n${description}\n`
  let body = bodyFallback
  if (fs.existsSync(target)) {
    const raw = fs.readFileSync(target, 'utf8')
    if (raw.startsWith('---')) {
      const end = raw.indexOf('\n---', 3)
      body = end >= 0 ? raw.slice(end + 4).replace(/^\n/, '') : bodyFallback
    } else {
      body = raw.trim() ? raw : bodyFallback
    }
  }
  const content = `---\nname: ${name}\ndescription: ${String(description).replace(/\n/g, ' ')}\nversion: ${version}\n---\n\n${body.trim()}\n`
  fs.writeFileSync(path.join(skillDir, 'skill.md'), content, 'utf8')
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf8')
  return { name, description, version, slugHint: slugifySkillName(skillMeta.skillId || name) }
}

function resolveExistingDir(candidates, homeDir) {
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue
    let dir = expandPath(raw, homeDir)
    if (!dir || !fs.existsSync(dir)) continue
    if (fs.statSync(dir).isFile()) {
      if (/\.md$/i.test(dir)) {
        // Single markdown file — use parent only if package files already sit beside it;
        // otherwise treat as missing so we can rebuild from content.
        const siblingSkill = ['skill.md', 'SKILL.md', 'manifest.json'].some((name) =>
          fs.existsSync(path.join(path.dirname(dir), name)),
        )
        if (siblingSkill) dir = path.dirname(dir)
        else continue
      } else if (/\.zip$/i.test(dir)) {
        continue
      } else {
        dir = path.dirname(dir)
      }
    }
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir
  }
  return ''
}

/**
 * Ensure standard package layout + SkillHub-compatible frontmatter, then zip with JSZip.
 * Recovers when localPath was lost but content / agentInstallPath / zip still exists.
 */
async function packSkillZip({ homeDir, skill, version } = {}) {
  try {
    if (!skill) return { ok: false, error: '缺少 Skill' }
    const root = homeDir || os.homedir()
    const publishVersion = version || skill.version || '1.0.0'

    // Fast path: already have a usable zip on disk
    const existingZip = skill.zipPath ? expandPath(skill.zipPath, root) : ''
    if (
      existingZip &&
      fs.existsSync(existingZip) &&
      fs.statSync(existingZip).isFile() &&
      /\.zip$/i.test(existingZip) &&
      // Prefer rebuilding when we still have a package dir (keeps version/metadata fresh)
      !resolveExistingDir([skill.localPath, skill.agentInstallPath], root)
    ) {
      return {
        ok: true,
        zipPath: existingZip,
        version: publishVersion,
        name: skill.name,
        tmpDir: null,
        reusedZip: true,
      }
    }

    let dir = resolveExistingDir([skill.localPath, skill.agentInstallPath], root)
    let recoveredPath = ''

    if (!dir) {
      const content = typeof skill.content === 'string' ? skill.content.trim() : ''
      if (!content) {
        return {
          ok: false,
          error: 'Skill 本地目录不存在，且没有可恢复的内容。请回到「我的」重新打开或再创建一次。',
        }
      }
      const folderHint =
        expandPath(skill.localPath, root) ||
        expandPath(skill.agentInstallPath, root) ||
        path.join(root, 'new_skills', String(skill.skillId || skill.name || 'skill').replace(/[<>:"|?*]/g, '_'))
      dir = folderHint
      fs.mkdirSync(dir, { recursive: true })
      recoveredPath = toDisplayPath(dir, root)
    }

    const meta = {
      ...skill,
      version: publishVersion,
      origin: skill.origin || 'created',
      author: skill.author || skill.sourceName || 'unknown',
      sourceId: skill.sourceId || 'local',
    }
    if (!meta.content) {
      for (const name of ['skill.md', 'SKILL.md']) {
        const skillMd = path.join(dir, name)
        if (fs.existsSync(skillMd)) {
          meta.content = fs.readFileSync(skillMd, 'utf8')
          break
        }
      }
    }
    if (!meta.content || !String(meta.content).trim()) {
      return { ok: false, error: 'Skill 内容为空，无法打包发布' }
    }

    const written = ensureSkillPackage(dir, meta)
    if (!written.ok) return { ok: false, error: written.error || '打包前写入失败' }
    const fm = ensureFrontmatter(dir, meta)

    normalizeSkillPackage(
      dir,
      { ...meta, content: fs.readFileSync(path.join(dir, 'skill.md'), 'utf8') },
      { writeSkillJson: true },
    )

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-publish-'))
    const zipPath = path.join(tmpDir, `${fm.slugHint || 'skill'}-${fm.version}.zip`)
    await zipDirectory(dir, zipPath, {
      rootName: fm.slugHint || 'skill',
      exclude: (rel) => /(^|\/)skill\.json$/i.test(rel),
    })
    return {
      ok: true,
      zipPath,
      version: fm.version,
      name: fm.name,
      tmpDir,
      localPath: recoveredPath || toDisplayPath(dir, root),
    }
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
  slugifyName: slugifySkillName,
}
