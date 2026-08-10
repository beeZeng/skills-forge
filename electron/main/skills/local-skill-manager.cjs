/**
 * Local Skill Manager
 *
 * - Scans ~/.agent/skills/{skill_id}/
 * - Indexes into ~/.agent/registry.json
 * - Installs from zip with conflict rules (upgrade backup / hash mismatch prompt)
 * - Cross-platform Node fs/path only (no shell cp/mv/rm)
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const {
  readManifestFile,
  compareSemverLike,
  buildSkillId,
  safeSkillIdDir,
  buildManifest,
  writeManifestFile,
} = require('./manifest.cjs')
const { unzipToDirectory, hashFile, listDirectoryTree, listFilesRecursive } = require('./zip-fs.cjs')
const { normalizeSkillPackage } = require('./normalize-package.cjs')
const { toDisplayPath, expandPath, hashPackageDir } = require('./sync.cjs')

function getAgentHome(homeDir = os.homedir()) {
  return path.join(homeDir || os.homedir(), '.agent')
}

function getAgentSkillsRoot(homeDir = os.homedir()) {
  return path.join(getAgentHome(homeDir), 'skills')
}

function getRegistryPath(homeDir = os.homedir()) {
  return path.join(getAgentHome(homeDir), 'registry.json')
}

function getBackupsRoot(homeDir = os.homedir()) {
  return path.join(getAgentHome(homeDir), 'backups')
}

/** @deprecated use getRegistryPath */
function getInstalledRegistryPath(homeDir = os.homedir()) {
  return getRegistryPath(homeDir)
}

function ensureSkillsRoot(homeDir = os.homedir()) {
  const root = getAgentSkillsRoot(homeDir)
  fs.mkdirSync(root, { recursive: true })
  return root
}

function emptyRegistry() {
  return { version: 1, scannedAt: null, skills: {} }
}

function normalizeRecord(raw = {}) {
  const skill_id = safeSkillIdDir(raw.skill_id || raw.skillId || '')
  if (!skill_id) return null
  return {
    skill_id,
    name: raw.name || skill_id,
    version: raw.version || '0.0.0',
    source: raw.source || raw.sourceId || 'unknown',
    install_path: raw.install_path || raw.installPath || '',
    path: raw.path || `skills/${skill_id}`,
    hash: raw.hash || raw.contentHash || '',
    install_time: raw.install_time || raw.installedAt || null,
    mtimeMs: typeof raw.mtimeMs === 'number' ? raw.mtimeMs : 0,
    status: raw.status || 'installed',
    skillUid: raw.skillUid,
    zip_hash: raw.zip_hash || raw.zipHash || undefined,
  }
}

function readRegistry(homeDir = os.homedir()) {
  migrateLegacyInstalledJson(homeDir)
  const file = getRegistryPath(homeDir)
  if (!fs.existsSync(file)) return emptyRegistry()
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!raw || typeof raw !== 'object') return emptyRegistry()
    const skills = {}
    if (Array.isArray(raw.skills)) {
      for (const item of raw.skills) {
        const rec = normalizeRecord(item)
        if (rec) skills[rec.skill_id] = rec
      }
    } else if (raw.skills && typeof raw.skills === 'object') {
      for (const [key, item] of Object.entries(raw.skills)) {
        const rec = normalizeRecord({ ...item, skill_id: item?.skill_id || item?.skillId || key })
        if (rec) skills[rec.skill_id] = rec
      }
    }
    return {
      version: raw.version || 1,
      scannedAt: raw.scannedAt || null,
      skills,
    }
  } catch {
    return emptyRegistry()
  }
}

function writeRegistry(registry, homeDir = os.homedir()) {
  const agentHome = getAgentHome(homeDir)
  fs.mkdirSync(agentHome, { recursive: true })
  const file = getRegistryPath(homeDir)
  const skillsMap = registry.skills || {}
  // Phase 1 on-disk shape: skills is an array
  const skills = Object.values(skillsMap)
    .map((raw) => normalizeRecord(raw))
    .filter(Boolean)
    .map((r) => ({
      skill_id: r.skill_id,
      name: r.name,
      version: r.version,
      source: r.source,
      install_path: r.install_path,
      hash: r.hash,
      status: r.status,
      // optional bookkeeping
      path: r.path,
      install_time: r.install_time,
      mtimeMs: r.mtimeMs,
      skillUid: r.skillUid,
      zip_hash: r.zip_hash,
    }))
  const payload = {
    version: registry.version || 1,
    scannedAt: registry.scannedAt || null,
    updatedAt: new Date().toISOString(),
    skills,
  }
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8')
  return file
}

function migrateLegacyInstalledJson(homeDir = os.homedir()) {
  const legacy = path.join(getAgentSkillsRoot(homeDir), 'installed.json')
  const modern = getRegistryPath(homeDir)
  if (!fs.existsSync(legacy) || fs.existsSync(modern)) return
  try {
    const raw = JSON.parse(fs.readFileSync(legacy, 'utf8'))
    const skills = {}
    const entries = raw?.skills && typeof raw.skills === 'object' ? Object.values(raw.skills) : []
    for (const item of entries) {
      const skill_id = buildSkillId({
        skill_id: item.skill_id || item.skillId,
        skillId: item.skillId || item.name,
        sourceId: item.sourceId || item.source || 'local',
        name: item.name,
      })
      const rec = normalizeRecord({
        ...item,
        skill_id,
        source: item.source || item.sourceId || 'local',
        install_path: item.installPath || item.install_path,
        hash: item.contentHash || item.hash,
        install_time: item.installedAt || item.install_time,
        status: 'installed',
      })
      if (rec) skills[rec.skill_id] = rec
    }
    writeRegistry({ version: 1, scannedAt: null, skills }, homeDir)
  } catch {
    // ignore migration errors
  }
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

function dirMtimeMs(dir) {
  try {
    let max = fs.statSync(dir).mtimeMs
    const mf = path.join(dir, 'manifest.json')
    if (fs.existsSync(mf)) max = Math.max(max, fs.statSync(mf).mtimeMs)
    return max
  } catch {
    return 0
  }
}

function hashSkillDir(dir) {
  try {
    return hashPackageDir(dir)
  } catch {
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
}

function buildRecordFromDir(dir, homeDir, extras = {}) {
  let manifestResult = readManifestFile(dir)
  const mtimeMs = dirMtimeMs(dir)

  // Phase 1: legacy dirs without manifest → auto-generate skill_id + manifest
  if (!manifestResult.ok) {
    const dirName = path.basename(dir)
    const skill_id = isLikelySkillId(dirName)
      ? safeSkillIdDir(dirName)
      : buildSkillId({ name: dirName, sourceId: 'local', source: 'local' })
    const displayName = isLikelySkillId(dirName)
      ? dirName.split('.').filter(Boolean).slice(-1)[0] || dirName
      : dirName
    const written = writeManifestFile(dir, {
      skill_id,
      name: displayName,
      version: '1.0.0',
      source: 'local',
      author: 'unknown',
      description: '本地遗留 Skill（首次扫描自动生成 manifest）',
      entry: detectLegacyEntry(dir) || '',
    })
    if (!fs.existsSync(path.join(dir, 'skill.md')) && !fs.existsSync(path.join(dir, 'SKILL.md'))) {
      const body = `# ${displayName}\n\n本地遗留 Skill，已自动补齐 skill.md。\n`
      fs.writeFileSync(path.join(dir, 'skill.md'), body, 'utf8')
      fs.writeFileSync(path.join(dir, 'SKILL.md'), body, 'utf8')
    }
    if (!fs.existsSync(path.join(dir, 'README.md'))) {
      fs.writeFileSync(
        path.join(dir, 'README.md'),
        `# ${displayName}\n\n描述：\n本地遗留 Skill（自动生成）\n\n版本：\n1.0.0\n`,
        'utf8',
      )
    }
    if (written.ok) {
      const hash = hashSkillDir(dir)
      writeManifestFile(dir, { ...written.manifest, hash })
      manifestResult = readManifestFile(dir)
    } else {
      return {
        skill_id: skill_id,
        name: displayName,
        version: '0.0.0',
        source: 'unknown',
        install_path: toDisplayPath(dir, homeDir),
        path: `skills/${skill_id}`,
        hash: '',
        install_time: extras.install_time || null,
        mtimeMs,
        status: 'invalid',
        error: written.error || manifestResult.error,
      }
    }
  }

  if (!manifestResult.ok) {
    const fallbackId = safeSkillIdDir(path.basename(dir))
    return {
      skill_id: fallbackId,
      name: fallbackId,
      version: '0.0.0',
      source: 'unknown',
      install_path: toDisplayPath(dir, homeDir),
      path: `skills/${fallbackId}`,
      hash: '',
      install_time: extras.install_time || null,
      mtimeMs,
      status: 'invalid',
      error: manifestResult.error,
    }
  }

  const mf = manifestResult.manifest
  const skill_id = safeSkillIdDir(mf.skill_id)
  const hash = hashSkillDir(dir)
  // Keep hash field on disk in sync
  if (!mf.hash || mf.hash !== hash) {
    writeManifestFile(dir, { ...mf, hash })
  }
  return {
    skill_id,
    name: mf.name,
    version: mf.version,
    source: mf.source,
    install_path: toDisplayPath(dir, homeDir),
    path: `skills/${skill_id}`,
    hash,
    install_time: extras.install_time || new Date().toISOString(),
    mtimeMs: dirMtimeMs(dir),
    status: 'installed',
    skillUid: extras.skillUid,
  }
}

function isLikelySkillId(name) {
  const parts = String(name || '')
    .split('.')
    .filter(Boolean)
  return parts.length >= 3
}

function detectLegacyEntry(dir) {
  const priority = ['main.py', 'index.py', 'skill.py', 'main.js', 'index.js', 'skill.js']
  for (const name of priority) {
    if (fs.existsSync(path.join(dir, name))) return name
  }
  return ''
}

/**
 * Incremental (or full) scan of ~/.agent/skills
 */
function scanLocalSkills(homeDir = os.homedir(), { forceFull = false } = {}) {
  const skillsRoot = ensureSkillsRoot(homeDir)
  const registry = readRegistry(homeDir)
  const prev = registry.skills || {}
  const next = {}
  const stats = { scanned: 0, updated: 0, skipped: 0, removed: 0, invalid: 0 }

  let entries = []
  try {
    entries = fs.readdirSync(skillsRoot, { withFileTypes: true }).filter((e) => e.isDirectory())
  } catch {
    entries = []
  }

  const seen = new Set()
  for (const entry of entries) {
    if (entry.name === 'installed.json') continue
    const dir = path.join(skillsRoot, entry.name)
    seen.add(entry.name)
    stats.scanned += 1

    const existing = prev[entry.name] || Object.values(prev).find((r) => {
      const abs = expandPath(r.install_path || '', homeDir)
      return abs === dir || r.skill_id === entry.name
    })

    const mtimeMs = dirMtimeMs(dir)
    const needsParse =
      forceFull ||
      !existing ||
      !registry.scannedAt ||
      existing.mtimeMs !== mtimeMs ||
      existing.status === 'invalid'

    if (!needsParse && existing) {
      // Quick path: keep existing if manifest mtime unchanged
      next[existing.skill_id] = { ...existing, mtimeMs }
      stats.skipped += 1
      continue
    }

    const record = buildRecordFromDir(dir, homeDir, {
      install_time: existing?.install_time || null,
      skillUid: existing?.skillUid,
    })
    // If hash unchanged and version same, preserve install_time
    if (existing?.hash && existing.hash === record.hash) {
      record.install_time = existing.install_time || record.install_time
      stats.skipped += 1
    } else {
      stats.updated += 1
    }
    if (record.status === 'invalid') stats.invalid += 1
    next[record.skill_id] = record
  }

  for (const id of Object.keys(prev)) {
    if (!next[id]) {
      const abs = expandPath(prev[id].install_path || '', homeDir)
      if (!abs || !fs.existsSync(abs)) {
        stats.removed += 1
      } else if (!seen.has(safeSkillIdDir(id)) && !seen.has(path.basename(abs))) {
        stats.removed += 1
      } else {
        next[id] = prev[id]
      }
    }
  }

  const updated = {
    version: 1,
    scannedAt: new Date().toISOString(),
    skills: next,
  }
  writeRegistry(updated, homeDir)
  return {
    ok: true,
    registry: {
      version: updated.version,
      scannedAt: updated.scannedAt,
      skills: Object.values(next),
    },
    skills: Object.values(next),
    stats,
    root: toDisplayPath(skillsRoot, homeDir),
    registryPath: toDisplayPath(getRegistryPath(homeDir), homeDir),
  }
}

function getInstalled(skillIdOrName, homeDir = os.homedir()) {
  const key = String(skillIdOrName || '').trim()
  if (!key) return null
  const registry = readRegistry(homeDir)
  if (registry.skills[key]) return registry.skills[key]
  const safe = safeSkillIdDir(key)
  if (registry.skills[safe]) return registry.skills[safe]
  return (
    Object.values(registry.skills).find(
      (s) => s.skill_id === key || s.name === key || s.skillUid === key,
    ) || null
  )
}

function listInstalled(homeDir = os.homedir()) {
  return Object.values(readRegistry(homeDir).skills || {})
}

function backupSkill(skillId, installAbsPath, version, homeDir = os.homedir()) {
  if (!installAbsPath || !fs.existsSync(installAbsPath)) return null
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = path.join(
    getBackupsRoot(homeDir),
    safeSkillIdDir(skillId),
    `${String(version || 'unknown').replace(/[<>:"|?*\\/]/g, '_')}-${stamp}`,
  )
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  copyDirSync(installAbsPath, dest)
  return dest
}

function resolvePackageDir(extractDir) {
  let packageDir = extractDir
  const top = fs.readdirSync(extractDir, { withFileTypes: true })
  if (top.length === 1 && top[0].isDirectory()) {
    const nested = path.join(extractDir, top[0].name)
    if (
      fs.existsSync(path.join(nested, 'manifest.json')) ||
      fs.existsSync(path.join(nested, 'skill.md')) ||
      fs.existsSync(path.join(nested, 'SKILL.md'))
    ) {
      packageDir = nested
    }
  }
  return packageDir
}

/**
 * Install from skill zip.
 * conflictResolution: undefined | 'overwrite' | 'update' | 'keep' | 'cancel'
 */
async function installFromZip({
  zipPath,
  expectedHash,
  homeDir = os.homedir(),
  sourceId,
  skillUid,
  force = false,
  conflictResolution,
  skillMeta = {},
} = {}) {
  if (!zipPath || !fs.existsSync(zipPath)) {
    return { ok: false, error: 'zip 文件不存在' }
  }
  if (conflictResolution === 'cancel' || conflictResolution === 'keep') {
    return { ok: false, cancelled: true, conflictResolution, error: '已取消安装' }
  }

  const sha256 = hashFile(zipPath)
  if (expectedHash && expectedHash !== sha256) {
    return { ok: false, error: `zip hash 不匹配（期望 ${expectedHash.slice(0, 12)}…）` }
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-lsm-install-'))
  try {
    const extractDir = path.join(tmpRoot, 'extracted')
    await unzipToDirectory(zipPath, extractDir)
    let packageDir = resolvePackageDir(extractDir)

    let manifestResult = readManifestFile(packageDir)
    if (!manifestResult.ok) {
      const normalizedDir = path.join(tmpRoot, 'normalized')
      const normalized = normalizeSkillPackage(
        normalizedDir,
        {
          ...skillMeta,
          content: fs.existsSync(path.join(packageDir, 'skill.md'))
            ? fs.readFileSync(path.join(packageDir, 'skill.md'), 'utf8')
            : fs.existsSync(path.join(packageDir, 'SKILL.md'))
              ? fs.readFileSync(path.join(packageDir, 'SKILL.md'), 'utf8')
              : undefined,
          name: skillMeta.name || path.basename(packageDir),
          version: skillMeta.version || '1.0.0',
          sourceId: sourceId || skillMeta.sourceId || 'local',
          skillId: skillMeta.skillId,
          description: skillMeta.description || '',
          origin: 'imported',
        },
        { sourceDir: packageDir, writeSkillJson: false, layout: 'flat', allowEmptySkillMd: true },
      )
      if (!normalized.ok) {
        return { ok: false, error: manifestResult.error || normalized.error || 'manifest 无效' }
      }
      packageDir = normalizedDir
      manifestResult = { ok: true, manifest: normalized.manifest }
    }

    // Ensure skill_id present
    let manifest = manifestResult.manifest
    if (!manifest.skill_id) {
      manifest = buildManifest({ ...skillMeta, ...manifest, sourceId: sourceId || manifest.source })
    }

    const skill_id = safeSkillIdDir(manifest.skill_id)
    const skillsRoot = ensureSkillsRoot(homeDir)
    const dest = path.join(skillsRoot, skill_id)
    const registry = readRegistry(homeDir)
    const existing = registry.skills[skill_id] || null

    const staging = path.join(tmpRoot, 'staging')
    const normalized = normalizeSkillPackage(
      staging,
      {
        ...manifest,
        ...skillMeta,
        skill_id,
        skillId: skill_id,
        sourceId: sourceId || manifest.source,
        source: sourceId || manifest.source,
        content: fs.existsSync(path.join(packageDir, 'skill.md'))
          ? fs.readFileSync(path.join(packageDir, 'skill.md'), 'utf8')
          : fs.existsSync(path.join(packageDir, 'SKILL.md'))
            ? fs.readFileSync(path.join(packageDir, 'SKILL.md'), 'utf8')
            : undefined,
        origin: 'imported',
      },
      { sourceDir: packageDir, writeSkillJson: false, layout: 'flat', allowEmptySkillMd: true },
    )
    if (!normalized.ok) return { ok: false, error: normalized.error || '规范化失败' }

    const incomingContentHash = hashSkillDir(staging)
    manifest = normalized.manifest || manifest

    if (existing && !force) {
      const sameVersion = compareSemverLike(manifest.version, existing.version) === 0
      const existingHash = existing.hash || ''

      // Identical content
      if (sameVersion && existingHash && existingHash === incomingContentHash) {
        return {
          ok: true,
          skipped: true,
          installPath: dest,
          manifest,
          installed: existing,
          zipHash: sha256,
        }
      }

      // Same version, different content hash → conflict (unless overwrite)
      if (sameVersion && existingHash && existingHash !== incomingContentHash) {
        if (conflictResolution !== 'overwrite') {
          return {
            ok: false,
            conflict: 'hash_mismatch',
            error: `本地已安装同版本 Skill（${skill_id}@${existing.version}），内容 hash 不同`,
            existing,
            incoming: {
              skill_id,
              name: manifest.name,
              version: manifest.version,
              hash: incomingContentHash,
              source: manifest.source,
            },
            zipPath,
            zipHash: sha256,
          }
        }
      }

      // Same skill_id, different version → prompt update (unless overwrite/update)
      if (!sameVersion) {
        if (conflictResolution !== 'overwrite' && conflictResolution !== 'update') {
          return {
            ok: false,
            conflict: 'version_update',
            error: `发现新版本：${existing.version} → ${manifest.version}`,
            existing,
            incoming: {
              skill_id,
              name: manifest.name,
              version: manifest.version,
              hash: incomingContentHash,
              source: manifest.source,
            },
            zipPath,
            zipHash: sha256,
          }
        }
      }

      // Proceed with upgrade / overwrite — backup old version
      if (!sameVersion || conflictResolution === 'overwrite' || conflictResolution === 'update') {
        const absExisting = expandPath(existing.install_path, homeDir) || dest
        backupSkill(skill_id, absExisting, existing.version, homeDir)
      }
    } else if (existing && force) {
      const absExisting = expandPath(existing.install_path, homeDir) || dest
      if (fs.existsSync(absExisting)) backupSkill(skill_id, absExisting, existing.version, homeDir)
    }

    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
    copyDirSync(staging, dest)

    const contentHash = hashSkillDir(dest)
    const finalManifest = writeManifestFile(dest, {
      ...(normalized.manifest || manifest),
      skill_id,
      hash: contentHash,
    })
    const record = {
      skill_id,
      name: finalManifest.manifest?.name || normalized.manifest?.name || manifest.name,
      version: finalManifest.manifest?.version || normalized.manifest?.version || manifest.version,
      source: finalManifest.manifest?.source || normalized.manifest?.source || manifest.source || sourceId || 'unknown',
      install_path: toDisplayPath(dest, homeDir),
      path: `skills/${skill_id}`,
      hash: contentHash,
      zip_hash: sha256,
      install_time: new Date().toISOString(),
      mtimeMs: dirMtimeMs(dest),
      status: 'installed',
      skillUid: skillUid || existing?.skillUid,
    }

    registry.skills[skill_id] = record
    registry.scannedAt = new Date().toISOString()
    writeRegistry(registry, homeDir)

    return {
      ok: true,
      installPath: dest,
      manifest: finalManifest.manifest || normalized.manifest || manifest,
      installed: record,
      zipHash: sha256,
      updated: Boolean(existing),
      upgraded: Boolean(existing && existing.version !== record.version),
    }
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}

function uninstall(skillIdOrName, homeDir = os.homedir()) {
  const key = String(skillIdOrName || '').trim()
  if (!key) return { ok: false, error: '缺少 skill_id' }
  const registry = readRegistry(homeDir)
  const record =
    registry.skills[key] ||
    registry.skills[safeSkillIdDir(key)] ||
    Object.values(registry.skills).find((s) => s.name === key || s.skill_id === key)

  const skill_id = record?.skill_id || safeSkillIdDir(key)
  const dest =
    (record?.install_path && expandPath(record.install_path, homeDir)) ||
    path.join(getAgentSkillsRoot(homeDir), skill_id)

  if (dest && fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true })
  }
  if (record) delete registry.skills[record.skill_id]
  delete registry.skills[key]
  delete registry.skills[skill_id]
  writeRegistry(registry, homeDir)
  return { ok: true, removedPath: dest, skill_id }
}

function readPackageMeta(installPathOrId, homeDir = os.homedir()) {
  let dir = installPathOrId
  if (!dir) return { ok: false, error: '缺少路径' }
  if (!path.isAbsolute(dir) && !String(dir).includes('/') && !String(dir).includes('\\')) {
    const record = getInstalled(dir, homeDir)
    dir =
      (record?.install_path && expandPath(record.install_path, homeDir)) ||
      path.join(getAgentSkillsRoot(homeDir), safeSkillIdDir(dir))
  } else {
    dir = expandPath(dir, homeDir)
  }
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return { ok: false, error: 'Skill 目录不存在' }
  }

  const manifestResult = readManifestFile(dir)
  let readme = ''
  for (const name of ['README.md', 'readme.md']) {
    const file = path.join(dir, name)
    if (fs.existsSync(file)) {
      readme = fs.readFileSync(file, 'utf8')
      break
    }
  }
  let skillMd = ''
  for (const name of ['skill.md', 'SKILL.md']) {
    const file = path.join(dir, name)
    if (fs.existsSync(file)) {
      skillMd = fs.readFileSync(file, 'utf8')
      break
    }
  }
  const fileTree = listDirectoryTree(dir).filter((n) => n.name !== 'skill.json')
  const skill_id = manifestResult.manifest?.skill_id

  return {
    ok: true,
    path: toDisplayPath(dir, homeDir),
    absolutePath: dir,
    manifest: manifestResult.ok ? manifestResult.manifest : null,
    readme,
    skillMd,
    fileTree,
    installed: skill_id ? getInstalled(skill_id, homeDir) : null,
  }
}

function listPackageTree(installPathOrId, homeDir = os.homedir()) {
  const meta = readPackageMeta(installPathOrId, homeDir)
  if (!meta.ok) return meta
  return { ok: true, path: meta.path, fileTree: meta.fileTree }
}

/** Compat alias */
const safeSkillDirName = safeSkillIdDir
const readInstalledRegistry = readRegistry
const writeInstalledRegistry = writeRegistry

module.exports = {
  getAgentHome,
  getAgentSkillsRoot,
  getRegistryPath,
  getInstalledRegistryPath,
  getBackupsRoot,
  readRegistry,
  writeRegistry,
  readInstalledRegistry,
  writeInstalledRegistry,
  scanLocalSkills,
  getInstalled,
  listInstalled,
  installFromZip,
  uninstall,
  readPackageMeta,
  listPackageTree,
  safeSkillIdDir,
  safeSkillDirName,
  backupSkill,
  hashFile,
  buildSkillId,
}
