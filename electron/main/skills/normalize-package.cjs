/**
 * Normalize arbitrary skill content into the standard package layout:
 *
 * skill-name/
 * ├── manifest.json
 * ├── README.md
 * ├── skill.md
 * ├── SKILL.md   (compat alias for Cursor etc.)
 * ├── tools/
 * └── resources/
 */

const fs = require('fs')
const path = require('path')
const { writeManifestFile, buildManifest, slugifySkillName } = require('./manifest.cjs')
const { listFilesRecursive } = require('./zip-fs.cjs')
const crypto = require('crypto')

function hashPackageContents(dir) {
  const files = listFilesRecursive(dir)
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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function safeRel(rel) {
  return String(rel || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\0/g, '')
}

function findSkillMarkdown(dir) {
  const candidates = ['skill.md', 'SKILL.md', 'Skill.md']
  for (const name of candidates) {
    const file = path.join(dir, name)
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file
  }
  // nested single skill folder
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      for (const name of candidates) {
        const file = path.join(dir, entry.name, name)
        if (fs.existsSync(file) && fs.statSync(file).isFile()) return file
      }
    }
  } catch {
    // ignore
  }
  return null
}

function readTextIfExists(...candidates) {
  for (const file of candidates) {
    if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
      return fs.readFileSync(file, 'utf8')
    }
  }
  return ''
}

function buildMinimalReadme(manifest, skillBody, fileList = []) {
  const files = (fileList || []).slice(0, 40)
  const lines = [
    `# ${manifest.name}`,
    '',
    '描述：',
    manifest.description || '用户上传 Skill',
    '',
  ]
  if (files.length) {
    lines.push('文件：', ...files.map((f) => `- ${f}`), '')
  }
  lines.push(
    `版本：`,
    String(manifest.version || '1.0.0'),
    '',
    `- skill_id: ${manifest.skill_id || ''}`,
    `- Source: ${manifest.source || ''}`,
    `- Author: ${manifest.author || ''}`,
  )
  if (manifest.entry) lines.push(`- Entry: ${manifest.entry}`)
  if (manifest.homepage) lines.push(`- Homepage: ${manifest.homepage}`)
  if (skillBody && skillBody.trim() && !skillBody.includes(manifest.description || '___')) {
    lines.push('', '## Skill', '', skillBody.trim().slice(0, 4000))
  }
  return `${lines.join('\n').trim()}\n`
}

function buildAgentSkillMd(manifest, options = {}) {
  const name = manifest.name || 'Skill'
  const description = manifest.description || '用户上传 Skill'
  const entry = manifest.entry || options.entry || ''
  const files = options.files || []
  return [
    `# ${name}`,
    '',
    '## 功能描述',
    '',
    description,
    '',
    '## 适用场景',
    '',
    options.scenario || '由用户上传并规范化后的本地 Skill，可安装到 Agent 使用。',
    '',
    '## 输入',
    '',
    options.input || '根据 Skill 实现与调用约定提供输入。',
    '',
    '## 输出',
    '',
    options.output || '返回 Skill 执行结果或产物。',
    '',
    '## 入口',
    '',
    entry || '（未指定入口文件）',
    '',
    files.length ? `## 文件\n\n${files.slice(0, 30).map((f) => `- ${f}`).join('\n')}\n` : '',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .concat('\n')
}

/**
 * Classify companion relative paths into tools/ or resources/, or keep root docs.
 */
function classifyRelativePath(rel) {
  const r = safeRel(rel)
  if (!r || r.includes('..')) return null
  if (/^(manifest\.json|skill\.json|readme\.md|skill\.md|SKILL\.md)$/i.test(r)) return null
  if (/^tools\//i.test(r) || /^resources\//i.test(r)) return r.replace(/^TOOLS\//i, 'tools/').replace(/^RESOURCES\//i, 'resources/')
  if (/\.(js|mjs|cjs|ts|py|sh|ps1|json)$/i.test(r) || /(^|\/)(scripts?|bin|cmd)\//i.test(r)) {
    return `tools/${r.replace(/^(tools|scripts?|bin|cmd)\//i, '')}`
  }
  if (/\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|md|txt|csv|ya?ml|toml|xml|html)$/i.test(r) || /(^|\/)(assets?|docs?|media|static)\//i.test(r)) {
    return `resources/${r.replace(/^(resources|assets?|docs?|media|static)\//i, '')}`
  }
  // default extras land in resources
  return `resources/${r}`
}

function copyRelativeFlat(sourceDir, destDir, rel) {
  const r = safeRel(rel)
  if (!r || r.includes('..')) return false
  if (/^(manifest\.json|skill\.json|readme\.md|skill\.md|SKILL\.md)$/i.test(r)) return false
  const src = path.join(sourceDir, ...r.split('/'))
  const dest = path.join(destDir, ...r.split('/'))
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return false
  if (fs.existsSync(dest)) return false
  ensureDir(path.dirname(dest))
  fs.copyFileSync(src, dest)
  return true
}

/**
 * Write a normalized package into destDir from skillMeta (+ optional already-extracted sourceDir).
 * options.layout: 'classified' (default) | 'flat' (keep user files at package root for publish)
 * @returns {{ ok: boolean, destDir?: string, manifest?: object, error?: string }}
 */
function normalizeSkillPackage(destDir, skillMeta = {}, options = {}) {
  if (!destDir) return { ok: false, error: '缺少目标目录' }
  ensureDir(destDir)

  const sourceDir = options.sourceDir && fs.existsSync(options.sourceDir) ? options.sourceDir : null
  const layout = options.layout === 'flat' ? 'flat' : 'classified'

  let skillContent =
    typeof skillMeta.content === 'string' && skillMeta.content.trim() ? skillMeta.content : ''

  if (!skillContent && sourceDir) {
    const md = findSkillMarkdown(sourceDir)
    if (md) skillContent = fs.readFileSync(md, 'utf8')
  }

  if (!skillContent && Array.isArray(skillMeta.files)) {
    const mdFile = skillMeta.files.find((f) => f?.relativePath && /(?:^|\/)(?:SKILL|skill)\.md$/i.test(f.relativePath))
    if (mdFile) {
      skillContent = Buffer.isBuffer(mdFile.content)
        ? mdFile.content.toString('utf8')
        : String(mdFile.content ?? '')
    }
  }

  const local =
    skillMeta.origin === 'created' ||
    skillMeta.origin === 'imported' ||
    skillMeta.sourceId === 'local' ||
    skillMeta.sourceId === 'offline' ||
    skillMeta.source === 'SkillHub' ||
    options.allowEmptySkillMd === true

  if (!local && !skillContent.trim()) {
    return { ok: false, error: '缺少 skill.md 内容，无法规范化 Skill 包' }
  }

  const sourceFiles = sourceDir ? listFilesRecursive(sourceDir) : []

  // Merge author from existing manifest if present
  let existingManifest = null
  if (sourceDir) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(sourceDir, 'manifest.json'), 'utf8'))
      existingManifest = raw
    } catch {
      existingManifest = null
    }
  }

  const written = writeManifestFile(destDir, {
    ...skillMeta,
    author: skillMeta.author || existingManifest?.author || skillMeta.sourceName || 'unknown',
    description: skillMeta.description || existingManifest?.description || '',
    name: skillMeta.name || existingManifest?.name || skillMeta.skillId || 'skill',
    version: skillMeta.version || existingManifest?.version || '1.0.0',
    sourceId: skillMeta.sourceId || skillMeta.source || existingManifest?.source || 'local',
    source: skillMeta.source || skillMeta.sourceId || existingManifest?.source || 'local',
    skill_id: skillMeta.skill_id || skillMeta.skillId || existingManifest?.skill_id,
    skillId: skillMeta.skillId || skillMeta.skill_id || existingManifest?.skill_id,
    entry: skillMeta.entry || existingManifest?.entry,
    created_time: skillMeta.created_time || existingManifest?.created_time,
    hash: skillMeta.hash || existingManifest?.hash,
  })
  if (!written.ok) return written
  const manifest = written.manifest

  if (!skillContent.trim()) {
    skillContent = buildAgentSkillMd(manifest, {
      entry: manifest.entry,
      files: sourceFiles,
      scenario: skillMeta.scenario,
      input: skillMeta.input,
      output: skillMeta.output,
    })
  }

  // skill.md + SKILL.md alias
  fs.writeFileSync(path.join(destDir, 'skill.md'), skillContent, 'utf8')
  fs.writeFileSync(path.join(destDir, 'SKILL.md'), skillContent, 'utf8')

  // README
  let readme = ''
  if (sourceDir) {
    readme = readTextIfExists(
      path.join(sourceDir, 'README.md'),
      path.join(sourceDir, 'readme.md'),
    )
  }
  if (!readme && Array.isArray(skillMeta.files)) {
    const readmeFile = skillMeta.files.find((f) => f?.relativePath && /^readme\.md$/i.test(path.posix.basename(f.relativePath)))
    if (readmeFile) {
      readme = Buffer.isBuffer(readmeFile.content)
        ? readmeFile.content.toString('utf8')
        : String(readmeFile.content ?? '')
    }
  }
  if (!readme.trim()) {
    readme = buildMinimalReadme(manifest, skillContent, sourceFiles.filter((f) => !/^(readme|skill|SKILL)\.md$/i.test(f)))
  }
  fs.writeFileSync(path.join(destDir, 'README.md'), readme, 'utf8')

  if (layout === 'classified') {
    ensureDir(path.join(destDir, 'tools'))
    ensureDir(path.join(destDir, 'resources'))
  }

  // Copy companion files from skillMeta.files
  if (Array.isArray(skillMeta.files)) {
    for (const file of skillMeta.files) {
      if (!file?.relativePath) continue
      const rel = safeRel(file.relativePath)
      if (!rel || rel.includes('..')) continue
      if (/^(manifest\.json|skill\.json|readme\.md|skill\.md|SKILL\.md)$/i.test(rel)) continue
      const classified = layout === 'flat' ? rel : classifyRelativePath(rel)
      if (!classified) continue
      const dest = path.join(destDir, ...classified.split('/'))
      ensureDir(path.dirname(dest))
      if (Buffer.isBuffer(file.content)) fs.writeFileSync(dest, file.content)
      else fs.writeFileSync(dest, String(file.content ?? ''), 'utf8')
    }
  }

  // Copy extras from sourceDir
  if (sourceDir) {
    for (const rel of sourceFiles) {
      if (/^(manifest\.json|skill\.json|readme\.md|skill\.md|SKILL\.md)$/i.test(rel)) continue
      if (layout === 'flat') {
        copyRelativeFlat(sourceDir, destDir, rel)
        continue
      }
      const classified = classifyRelativePath(rel)
      if (!classified) continue
      const src = path.join(sourceDir, ...rel.split('/'))
      const dest = path.join(destDir, ...classified.split('/'))
      if (fs.existsSync(dest)) continue
      ensureDir(path.dirname(dest))
      fs.copyFileSync(src, dest)
    }
  }

  // Keep a lightweight skill.json for app bookkeeping (not part of public zip tree requirement)
  if (options.writeSkillJson !== false) {
    fs.writeFileSync(
      path.join(destDir, 'skill.json'),
      JSON.stringify(
        {
          ...manifest,
          skillId: skillMeta.skillId || slugifySkillName(manifest.name),
          sourceId: skillMeta.sourceId,
          namespace: skillMeta.namespace || 'default',
          packageSource: skillMeta.packageSource,
          contentSource: skillMeta.contentSource,
          contentHash: skillMeta.contentHash || manifest.hash,
          installedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    )
  }

  // Phase 1: always persist content hash into manifest.json
  const contentHash = hashPackageContents(destDir)
  const hashed = writeManifestFile(destDir, {
    ...manifest,
    hash: contentHash,
    entry: manifest.entry || skillMeta.entry || '',
  })
  if (hashed.ok) {
    return { ok: true, destDir, manifest: hashed.manifest, contentHash }
  }

  return { ok: true, destDir, manifest, contentHash }
}

module.exports = {
  normalizeSkillPackage,
  findSkillMarkdown,
  buildMinimalReadme,
  buildAgentSkillMd,
  classifyRelativePath,
  slugifySkillName,
  buildManifest,
}
