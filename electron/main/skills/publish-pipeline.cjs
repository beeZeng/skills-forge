/**
 * Skill publish pipeline:
 * upload zip → extract → detect → normalize → security → repack → preview
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const {
  unzipToDirectory,
  zipDirectory,
  listFilesRecursive,
  listDirectoryTree,
} = require('./zip-fs.cjs')
const {
  readManifestFile,
  validateManifest,
  buildUserSkillId,
  slugifySkillName,
  writeManifestFile,
} = require('./manifest.cjs')
const { normalizeSkillPackage, buildAgentSkillMd } = require('./normalize-package.cjs')
const { scanZipFile, scanSkillDirectory, DEFAULT_MAX_ZIP_BYTES } = require('./security-scan.cjs')

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

const ENTRY_PRIORITY = ['main.py', 'index.py', 'skill.py', 'main.js', 'index.js', 'skill.js']

function cleanupDir(dir) {
  if (dir && fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}

function resolvePackageRoot(extractDir) {
  const direct = path.join(extractDir, 'manifest.json')
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return extractDir

  let entries = []
  try {
    entries = fs.readdirSync(extractDir, { withFileTypes: true })
  } catch {
    return extractDir
  }

  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'))
  const files = entries.filter((e) => e.isFile())
  if (dirs.length === 1 && files.length === 0) {
    const nested = path.join(extractDir, dirs[0].name)
    return nested
  }

  for (const d of dirs) {
    const mf = path.join(extractDir, d.name, 'manifest.json')
    if (fs.existsSync(mf) && fs.statSync(mf).isFile()) return path.join(extractDir, d.name)
  }

  return extractDir
}

function detectEntryCandidates(dir) {
  const files = listFilesRecursive(dir).map((r) => r.replace(/\\/g, '/'))
  const roots = files.filter((f) => !f.includes('/'))
  const codeFiles = files.filter((f) => /\.(py|js|mjs|cjs|ts)$/i.test(f))

  const prioritized = []
  for (const name of ENTRY_PRIORITY) {
    if (roots.includes(name) || files.includes(name)) prioritized.push(name)
  }

  const extras = codeFiles
    .filter((f) => !prioritized.includes(f))
    .sort((a, b) => {
      const ad = a.includes('/') ? 1 : 0
      const bd = b.includes('/') ? 1 : 0
      if (ad !== bd) return ad - bd
      return a.localeCompare(b)
    })

  const candidates = [...prioritized, ...extras]
  // de-dupe
  return [...new Set(candidates)]
}

function pickEntry(candidates, selected) {
  if (selected && candidates.includes(selected)) return selected
  if (selected && candidates.some((c) => c === selected.replace(/\\/g, '/'))) {
    return selected.replace(/\\/g, '/')
  }
  // Auto-pick only when exactly one candidate exists
  if (candidates.length === 1) return candidates[0]
  return null
}

function guessNameFromZip(zipPath, packageRoot) {
  const base = path.basename(zipPath, path.extname(zipPath))
  const cleaned = base.replace(/[-_]?\d+\.\d+\.\d+$/, '').trim()
  if (cleaned) return cleaned
  return path.basename(packageRoot) || 'skill'
}

function hashPackageTree(dir) {
  const files = listFilesRecursive(dir).sort()
  const hash = crypto.createHash('sha256')
  for (const rel of files) {
    if (/(^|\/)skill\.json$/i.test(rel)) continue
    hash.update(rel)
    hash.update('\0')
    hash.update(fs.readFileSync(path.join(dir, ...rel.split('/'))))
  }
  return hash.digest('hex')
}

function readText(file) {
  try {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return fs.readFileSync(file, 'utf8')
  } catch {
    // ignore
  }
  return ''
}

function buildPreviewTree(packageDir, rootName) {
  const tree = listDirectoryTree(packageDir)
  if (!rootName) return tree
  return [
    {
      name: rootName,
      path: rootName,
      type: 'dir',
      children: tree,
    },
  ]
}

/**
 * Prepare a publishable package from an uploaded zip.
 *
 * @returns preview payload; may set needsEntrySelection without producing zip.
 */
async function preparePublishFromZip(payload = {}) {
  const zipPath = String(payload.zipPath || '').trim()
  const username = String(payload.username || payload.userId || 'user').trim() || 'user'
  const author = String(payload.author || payload.displayName || username).trim() || username
  const maxZipBytes = Number(payload.maxZipBytes) > 0 ? Number(payload.maxZipBytes) : DEFAULT_MAX_ZIP_BYTES
  const existingIds = Array.isArray(payload.existingSkillIds) ? payload.existingSkillIds : []

  const zipScan = scanZipFile(zipPath, { maxZipBytes })
  if (!zipScan.ok) {
    return { ok: false, error: zipScan.errors.join('；') || 'zip 校验失败', errors: zipScan.errors }
  }

  const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-publish-prep-'))
  const extractDir = path.join(sessionDir, 'extract')
  const normalizedDir = path.join(sessionDir, 'normalized')

  try {
    await unzipToDirectory(zipPath, extractDir)
    const packageRoot = resolvePackageRoot(extractDir)

    const dirScan = scanSkillDirectory(packageRoot, {
      maxFileBytes: payload.maxFileBytes,
    })
    if (!dirScan.ok) {
      cleanupDir(sessionDir)
      return {
        ok: false,
        error: dirScan.errors.join('；') || '安全检查未通过',
        errors: dirScan.errors,
        warnings: dirScan.warnings,
      }
    }

    const hasManifest = fs.existsSync(path.join(packageRoot, 'manifest.json'))
    const kind = hasManifest ? 'standard' : 'ordinary'
    const entryCandidates = detectEntryCandidates(packageRoot)

    let selectedEntry = payload.entry ? String(payload.entry).replace(/\\/g, '/') : ''
    if (kind === 'ordinary') {
      const auto = pickEntry(entryCandidates, selectedEntry)
      if (!auto) {
        // Docs-only / markdown-only packages have no code entry — skip selection.
        // Multiple code candidates still need the user to pick one.
        if (entryCandidates.length > 0) {
          return {
            ok: true,
            needsEntrySelection: true,
            kind,
            sessionId: path.basename(sessionDir),
            sessionDir,
            extractDir: packageRoot,
            entryCandidates,
            suggestedName: guessNameFromZip(zipPath, packageRoot),
            warnings: dirScan.warnings,
            message: '请选择 Skill 入口文件',
          }
        }
        selectedEntry = ''
      } else {
        selectedEntry = auto
      }
    } else if (!selectedEntry) {
      selectedEntry = pickEntry(entryCandidates, '') || ''
    }

    return await finalizePublishSession({
      sessionDir,
      extractDir: packageRoot,
      kind,
      entry: selectedEntry,
      entryCandidates,
      username,
      author,
      name: payload.name,
      description: payload.description,
      version: payload.version,
      existingSkillIds: existingIds,
      zipPath,
      warnings: dirScan.warnings,
    })
  } catch (error) {
    cleanupDir(sessionDir)
    return { ok: false, error: error instanceof Error ? error.message : '规范化失败' }
  }
}

/**
 * Continue after user picks entry / edits metadata.
 */
async function finalizePublishSession(payload = {}) {
  let sessionDir = payload.sessionDir
  let extractDir = payload.extractDir

  // Resume from sessionId if only id provided
  if ((!sessionDir || !fs.existsSync(sessionDir)) && payload.sessionId) {
    const candidate = path.join(os.tmpdir(), payload.sessionId)
    if (fs.existsSync(candidate)) sessionDir = candidate
  }
  if (sessionDir && !extractDir) {
    const nested = path.join(sessionDir, 'extract')
    extractDir = fs.existsSync(nested) ? resolvePackageRoot(nested) : sessionDir
  }

  if (!extractDir || !fs.existsSync(extractDir)) {
    return { ok: false, error: '规范化会话已失效，请重新上传 zip' }
  }
  if (!sessionDir) {
    sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-publish-prep-'))
  }

  const username = String(payload.username || 'user').trim() || 'user'
  const author = String(payload.author || username).trim() || username
  const kind = payload.kind || (fs.existsSync(path.join(extractDir, 'manifest.json')) ? 'standard' : 'ordinary')
  const entryCandidates = Array.isArray(payload.entryCandidates)
    ? payload.entryCandidates
    : detectEntryCandidates(extractDir)

  let entry = payload.entry ? String(payload.entry).replace(/\\/g, '/') : ''
  if (kind === 'ordinary') {
    const picked = pickEntry(entryCandidates, entry)
    if (!picked) {
      if (entryCandidates.length > 0) {
        return {
          ok: true,
          needsEntrySelection: true,
          kind,
          sessionId: path.basename(sessionDir),
          sessionDir,
          extractDir,
          entryCandidates,
          suggestedName: payload.name || path.basename(extractDir),
          message: '请选择 Skill 入口文件',
        }
      }
      entry = ''
    } else {
      entry = picked
    }
  }

  const existingManifest = readManifestFile(extractDir)
  const suggestedName =
    String(payload.name || existingManifest.manifest?.name || path.basename(extractDir) || 'skill').trim() ||
    'skill'
  const version =
    String(payload.version || existingManifest.manifest?.version || '1.0.0').trim() || '1.0.0'
  const description = String(
    payload.description ||
      existingManifest.manifest?.description ||
      (kind === 'ordinary' ? '用户上传 Skill' : ''),
  ).trim()

  let skill_id = existingManifest.ok
    ? existingManifest.manifest.skill_id
    : buildUserSkillId(username, suggestedName, { existingIds: payload.existingSkillIds || [] })

  // For ordinary packages always use user-scoped id
  if (kind === 'ordinary') {
    skill_id = buildUserSkillId(username, suggestedName, {
      existingIds: payload.existingSkillIds || [],
    })
  }

  const normalizedDir = path.join(sessionDir, 'normalized')
  cleanupDir(normalizedDir)
  fs.mkdirSync(normalizedDir, { recursive: true })

  const meta = {
    skill_id,
    skillId: skill_id,
    name: suggestedName,
    version,
    description,
    author,
    source: 'SkillHub',
    sourceId: 'SkillHub',
    origin: 'imported',
    entry: entry || existingManifest.manifest?.entry || '',
    created_time: existingManifest.manifest?.created_time || new Date().toISOString(),
  }

  if (kind === 'standard' && existingManifest.ok) {
    // Validate + fill missing fields, keep user files flat
    const filled = {
      ...existingManifest.manifest,
      ...meta,
      skill_id: existingManifest.manifest.skill_id || skill_id,
      source: existingManifest.manifest.source || 'SkillHub',
    }
    const validated = validateManifest(filled)
    if (!validated.ok) {
      return { ok: false, error: validated.error || 'manifest 校验失败', sessionDir }
    }
    const norm = normalizeSkillPackage(
      normalizedDir,
      {
        ...validated.manifest,
        skill_id: validated.manifest.skill_id,
        skillId: validated.manifest.skill_id,
        entry: meta.entry,
        origin: 'imported',
        source: validated.manifest.source || 'SkillHub',
        sourceId: 'SkillHub',
        author: validated.manifest.author || author,
        content: readText(path.join(extractDir, 'skill.md')) || readText(path.join(extractDir, 'SKILL.md')),
      },
      { sourceDir: extractDir, layout: 'flat', allowEmptySkillMd: true, writeSkillJson: true },
    )
    if (!norm.ok) return { ok: false, error: norm.error || '规范化失败', sessionDir }
  } else {
    const norm = normalizeSkillPackage(
      normalizedDir,
      {
        ...meta,
        content: buildAgentSkillMd(
          { name: suggestedName, description, entry, version, skill_id, source: 'SkillHub', author },
          { files: listFilesRecursive(extractDir) },
        ),
      },
      { sourceDir: extractDir, layout: 'flat', allowEmptySkillMd: true, writeSkillJson: true },
    )
    if (!norm.ok) return { ok: false, error: norm.error || '规范化失败', sessionDir }
  }

  // Recompute hash after normalize and write into manifest
  const contentHash = hashPackageTree(normalizedDir)
  const manifestPath = path.join(normalizedDir, 'manifest.json')
  let manifest = {}
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    manifest = {}
  }
  manifest.hash = contentHash
  manifest.entry = meta.entry || manifest.entry || ''
  manifest.created_time = manifest.created_time || meta.created_time
  const rewritten = writeManifestFile(normalizedDir, {
    ...manifest,
    skill_id: manifest.skill_id || skill_id,
    source: manifest.source || 'SkillHub',
    hash: contentHash,
    entry: manifest.entry,
    created_time: manifest.created_time,
  })
  if (!rewritten.ok) return { ok: false, error: rewritten.error || '写入 manifest 失败', sessionDir }
  manifest = rewritten.manifest

  // SkillHub frontmatter for agent consumers
  ensureFrontmatter(normalizedDir, {
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    skillId: manifest.skill_id,
  })

  const rootName = slugifySkillName(manifest.name)
  const zipName = `${rootName}-${manifest.version}.zip`
  const outZip = path.join(sessionDir, zipName)
  const zipped = await zipDirectory(normalizedDir, outZip, {
    rootName,
    exclude: (rel) => /(^|\/)skill\.json$/i.test(rel),
  })

  const readme = readText(path.join(normalizedDir, 'README.md'))
  const skillMd = readText(path.join(normalizedDir, 'skill.md'))
  const fileTree = buildPreviewTree(normalizedDir, rootName)
  const files = listFilesRecursive(normalizedDir).filter((r) => !/(^|\/)skill\.json$/i.test(r))

  return {
    ok: true,
    needsEntrySelection: false,
    kind,
    ready: true,
    sessionId: path.basename(sessionDir),
    sessionDir,
    extractDir,
    packageDir: normalizedDir,
    zipPath: zipped.zipPath,
    zipHash: zipped.sha256,
    zipBytes: zipped.bytes,
    zipName,
    rootName,
    entry: manifest.entry || entry || '',
    entryCandidates,
    manifest,
    readme,
    skillMd,
    fileTree,
    files,
    contentHash,
    installTarget: 'Local Agent',
    warnings: payload.warnings || [],
  }
}

function cleanupPublishSession(sessionDirOrId) {
  if (!sessionDirOrId) return { ok: true }
  const dir = fs.existsSync(sessionDirOrId)
    ? sessionDirOrId
    : path.join(os.tmpdir(), String(sessionDirOrId))
  cleanupDir(dir)
  return { ok: true }
}

module.exports = {
  preparePublishFromZip,
  finalizePublishSession,
  cleanupPublishSession,
  detectEntryCandidates,
  resolvePackageRoot,
  ENTRY_PRIORITY,
}
