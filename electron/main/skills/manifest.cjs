/**
 * Skill package manifest.json helpers.
 * Required: manifest_version, skill_id, name, version, source, description, author
 * Phase 1 identity: com.{namespace}.{skill_name}
 */

const fs = require('fs')
const path = require('path')

const MANIFEST_VERSION = '1.0'

function slugifySegment(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .replace(/\.{2,}/g, '.') || 'unknown'
  )
}

function slugifySkillName(name) {
  return (
    String(name || 'skill')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'skill'
  )
}

/** Sanitize skill_id for use as a directory name (keep dots). */
function safeSkillIdDir(skillId) {
  return (
    String(skillId || 'skill')
      .replace(/[<>:"|?*\u0000-\u001f]/g, '_')
      .replace(/[\\/]+/g, '_')
      .replace(/^\.+/, '')
      .trim() || 'skill'
  )
}

/** True when id looks like reverse-DNS with ≥3 segments (com.ns.name). */
function isValidSkillIdFormat(skillId) {
  const id = String(skillId || '')
    .trim()
    .toLowerCase()
  if (!id) return false
  const parts = id.split('.').filter(Boolean)
  return parts.length >= 3 && parts.every((p) => /^[a-z0-9][a-z0-9_-]*$/.test(p))
}

/**
 * Build reverse-DNS style skill_id: com.{namespace}.{skill_name}
 * Never uses display name alone as the identity.
 * Catalog short `skillId` is NOT treated as global skill_id unless reverse-DNS.
 */
function buildSkillId(skillMeta = {}) {
  const explicit = skillMeta.skill_id || skillMeta.packageSource?.skill_id || ''
  if (typeof explicit === 'string' && explicit.trim()) {
    return safeSkillIdDir(explicit.trim())
  }
  const maybeId = typeof skillMeta.skillId === 'string' ? skillMeta.skillId.trim() : ''
  if (maybeId && maybeId.includes('.')) {
    return safeSkillIdDir(maybeId)
  }
  const namespace = slugifySegment(
    skillMeta.namespace ||
      skillMeta.source ||
      skillMeta.sourceId ||
      skillMeta.packageSource?.kind ||
      'local',
  )
  const id = slugifySegment(maybeId || skillMeta.slug || skillMeta.name || 'skill')
  return safeSkillIdDir(`com.${namespace}.${id}`)
}

/**
 * Publish / user upload identity: com.{namespace}.{skill_name}[+unique suffix]
 */
function buildUserSkillId(namespace, skillName, options = {}) {
  const ns = slugifySegment(namespace || 'user')
  const name = slugifySegment(skillName || 'skill')
  let base = safeSkillIdDir(`com.${ns}.${name}`)
  const existing = new Set(
    (options.existingIds || []).map((id) => String(id || '').trim().toLowerCase()).filter(Boolean),
  )
  if (!existing.has(base.toLowerCase())) return base

  const suffix =
    String(options.suffix || '')
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 8)
      .toLowerCase() || Math.random().toString(16).slice(2, 6)
  base = safeSkillIdDir(`com.${ns}.${name}.${suffix}`)
  let n = 0
  let candidate = base
  while (existing.has(candidate.toLowerCase()) && n < 20) {
    n += 1
    candidate = safeSkillIdDir(`com.${ns}.${name}.${suffix}${n}`)
  }
  return candidate
}

function buildManifest(skillMeta = {}) {
  const skill_id = buildSkillId(skillMeta)
  const name = String(skillMeta.name || skillMeta.skillId || 'skill').trim() || 'skill'
  const version = String(skillMeta.version || skillMeta.latestVersion || '1.0.0').trim() || '1.0.0'
  const source = String(
    skillMeta.source || skillMeta.sourceId || skillMeta.packageSource?.kind || 'local',
  ).trim() || 'local'
  const description = String(skillMeta.description || '').trim()
  const author = String(skillMeta.author || skillMeta.sourceName || source || 'unknown').trim() || 'unknown'

  const manifest = {
    manifest_version: String(skillMeta.manifest_version || MANIFEST_VERSION),
    skill_id,
    name,
    version,
    author,
    description,
    source,
    entry: skillMeta.entry ? String(skillMeta.entry).replace(/\\/g, '/') : '',
    hash: String(skillMeta.hash || skillMeta.contentHash || ''),
  }
  if (skillMeta.created_time || skillMeta.createdAt) {
    manifest.created_time = String(skillMeta.created_time || skillMeta.createdAt)
  } else {
    manifest.created_time = new Date().toISOString()
  }
  if (skillMeta.homepageUrl || skillMeta.homepage) {
    manifest.homepage = skillMeta.homepageUrl || skillMeta.homepage
  }
  if (skillMeta.license) manifest.license = skillMeta.license
  if (Array.isArray(skillMeta.tags) && skillMeta.tags.length) {
    manifest.tags = skillMeta.tags.map(String)
  }
  // Compat aliases for older readers
  manifest.skillId = skill_id
  manifest.sourceId = source
  return manifest
}

function validateManifest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'manifest.json 无效：不是对象' }
  }

  const skill_id = String(raw.skill_id || raw.skillId || '').trim()
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const version = typeof raw.version === 'string' ? raw.version.trim() : ''
  const source = String(raw.source || raw.sourceId || '').trim()
  const description = typeof raw.description === 'string' ? raw.description : ''
  const author = String(raw.author || source || 'unknown').trim() || 'unknown'
  const manifest_version = String(raw.manifest_version || MANIFEST_VERSION).trim() || MANIFEST_VERSION
  const entry = raw.entry ? String(raw.entry).replace(/\\/g, '/') : ''
  const hash = String(raw.hash || raw.contentHash || '')

  if (!skill_id) return { ok: false, error: 'manifest.json 缺少 skill_id' }
  if (!name) return { ok: false, error: 'manifest.json 缺少 name' }
  if (!version) return { ok: false, error: 'manifest.json 缺少 version' }
  if (!source) return { ok: false, error: 'manifest.json 缺少 source' }
  if (description === undefined || description === null) {
    return { ok: false, error: 'manifest.json 缺少 description' }
  }
  if (!author) return { ok: false, error: 'manifest.json 缺少 author' }

  return {
    ok: true,
    manifest: {
      ...raw,
      manifest_version,
      skill_id: safeSkillIdDir(skill_id),
      skillId: safeSkillIdDir(skill_id),
      name,
      version,
      author,
      description: String(description),
      source,
      sourceId: source,
      entry,
      hash,
    },
  }
}

function readManifestFile(dir) {
  const file = path.join(dir, 'manifest.json')
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return { ok: false, error: '缺少 manifest.json' }
  }
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'manifest.json 解析失败' }
  }
  return validateManifest(raw)
}

function writeManifestFile(dir, skillMeta = {}) {
  fs.mkdirSync(dir, { recursive: true })
  const manifest = buildManifest(skillMeta)
  const validated = validateManifest(manifest)
  if (!validated.ok) return validated
  const m = validated.manifest
  // Persist Phase 1 canonical fields first
  const toWrite = {
    manifest_version: m.manifest_version || MANIFEST_VERSION,
    skill_id: m.skill_id,
    name: m.name,
    version: m.version,
    author: m.author,
    description: m.description,
    source: m.source,
    entry: m.entry || '',
    hash: m.hash || '',
  }
  if (m.created_time) toWrite.created_time = m.created_time
  if (m.homepage) toWrite.homepage = m.homepage
  if (m.license) toWrite.license = m.license
  if (Array.isArray(m.tags) && m.tags.length) toWrite.tags = m.tags
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(toWrite, null, 2), 'utf8')
  return { ok: true, manifest: { ...m, ...toWrite } }
}

function zipFileName(skillMetaOrName, version) {
  if (typeof skillMetaOrName === 'object' && skillMetaOrName) {
    const slug = slugifySkillName(skillMetaOrName.name || skillMetaOrName.skillId || 'skill')
    const ver = String(skillMetaOrName.version || version || '1.0.0').replace(/[<>:"|?*\\/]/g, '_')
    return `${slug}-${ver}.zip`
  }
  const slug = slugifySkillName(skillMetaOrName)
  const ver = String(version || '1.0.0').replace(/[<>:"|?*\\/]/g, '_')
  return `${slug}-${ver}.zip`
}

function compareSemverLike(a, b) {
  const parse = (v) =>
    String(v || '0')
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .map((p) => (/^\d+$/.test(p) ? Number(p) : p))
  const aa = parse(a)
  const bb = parse(b)
  const len = Math.max(aa.length, bb.length)
  for (let i = 0; i < len; i += 1) {
    const x = aa[i] ?? 0
    const y = bb[i] ?? 0
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x > y ? 1 : -1
      continue
    }
    const xs = String(x)
    const ys = String(y)
    if (xs !== ys) return xs > ys ? 1 : -1
  }
  return 0
}

module.exports = {
  MANIFEST_VERSION,
  slugifySkillName,
  slugifySegment,
  safeSkillIdDir,
  isValidSkillIdFormat,
  buildSkillId,
  buildUserSkillId,
  buildManifest,
  validateManifest,
  readManifestFile,
  writeManifestFile,
  zipFileName,
  compareSemverLike,
}
