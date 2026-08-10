/**
 * Resolve and download full skill package content for marketplace / registry installs.
 * SkillsMP / Pale Blue Dot typically only expose GitHub metadata in list APIs;
 * ClawHub list APIs omit body and need detail/download endpoints.
 */

const path = require('path')

async function fetchText(url, { timeoutMs = 20000, headers = {} } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: '*/*', 'User-Agent': 'Nexus-SkillMesh/1.0', ...headers },
      signal: controller.signal,
      redirect: 'follow',
    })
    const text = await res.text()
    return { res, text }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJson(url, options) {
  const { res, text } = await fetchText(url, {
    ...options,
    headers: { Accept: 'application/json', ...(options?.headers || {}) },
  })
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  return { res, body, text }
}

function parseGithubTreeUrl(url) {
  if (!url || typeof url !== 'string') return null
  const m = url.trim().match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)(?:\/(.*))?)?\/?$/i,
  )
  if (!m) return null
  return {
    owner: m[1],
    repo: m[2],
    branch: m[3] || 'main',
    path: (m[4] || '').replace(/\/+$/, ''),
  }
}

function skillDirFromSourcePath(sourcePath) {
  if (!sourcePath) return ''
  const normalized = String(sourcePath).replace(/\\/g, '/').replace(/^\/+/, '')
  if (/\/SKILL\.md$/i.test(normalized) || /^SKILL\.md$/i.test(normalized)) {
    return normalized.replace(/\/?SKILL\.md$/i, '')
  }
  if (/\.md$/i.test(normalized)) {
    return path.posix.dirname(normalized === path.posix.basename(normalized) ? '' : normalized)
  }
  return normalized
}

function buildGithubRawUrl({ owner, repo, branch, filePath }) {
  const clean = String(filePath || '').replace(/^\/+/, '')
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch || 'main'}/${clean}`
}

function resolveGithubRef(skill = {}) {
  const src = skill.packageSource || {}
  if (src.owner && src.repo) {
    return {
      owner: src.owner,
      repo: src.repo,
      branch: src.branch || 'main',
      dirPath: skillDirFromSourcePath(src.path || src.sourceSkillPath || ''),
      skillMdPath:
        src.sourceSkillPath ||
        (src.path && /SKILL\.md$/i.test(src.path) ? src.path : null) ||
        (skillDirFromSourcePath(src.path) ? `${skillDirFromSourcePath(src.path)}/SKILL.md` : 'SKILL.md'),
    }
  }
  const fromUrl = parseGithubTreeUrl(src.githubUrl || skill.githubUrl || '')
  if (!fromUrl) return null
  const dirPath = skillDirFromSourcePath(fromUrl.path || src.path || '')
  return {
    owner: fromUrl.owner,
    repo: fromUrl.repo,
    branch: fromUrl.branch || src.branch || 'main',
    dirPath,
    skillMdPath: dirPath ? `${dirPath}/SKILL.md` : 'SKILL.md',
  }
}

async function fetchGithubSkillMd(ref) {
  // Prefer GitHub Contents API: raw.githubusercontent.com is often blocked in some regions.
  const apiUrl =
    `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${encodeURI(ref.skillMdPath)}` +
    `?ref=${encodeURIComponent(ref.branch)}`
  const { res, body, text } = await fetchJson(apiUrl, {
    timeoutMs: 25000,
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (res.ok && body) {
    if (body.encoding === 'base64' && typeof body.content === 'string') {
      const content = Buffer.from(body.content.replace(/\n/g, ''), 'base64').toString('utf8')
      if (content.trim()) return { ok: true, content, url: apiUrl }
    }
    if (body.download_url) {
      const fileRes = await fetchText(body.download_url, { timeoutMs: 25000 })
      if (fileRes.res.ok && fileRes.text?.trim()) {
        return { ok: true, content: fileRes.text, url: body.download_url }
      }
    }
  }

  // Fallback mirrors / raw (may fail behind some networks)
  const candidates = [
    buildGithubRawUrl({
      owner: ref.owner,
      repo: ref.repo,
      branch: ref.branch,
      filePath: ref.skillMdPath,
    }),
    `https://cdn.jsdelivr.net/gh/${ref.owner}/${ref.repo}@${ref.branch}/${String(ref.skillMdPath).replace(/^\/+/, '')}`,
  ]
  let lastError = `GitHub 拉取 SKILL.md 失败 HTTP ${res.status}`
  for (const url of candidates) {
    try {
      const raw = await fetchText(url, { timeoutMs: 20000 })
      if (raw.res.ok && raw.text?.trim()) return { ok: true, content: raw.text, url }
      lastError = `GitHub 拉取 SKILL.md 失败 HTTP ${raw.res.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'GitHub 拉取失败'
    }
  }
  return { ok: false, error: lastError, url: apiUrl, detail: text?.slice?.(0, 200) }
}

async function listGithubDir(ref, dirPath, depth, acc, limits) {
  if (depth > limits.maxDepth || acc.length >= limits.maxFiles) return
  const apiUrl =
    `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${encodeURI(dirPath || '')}` +
    `?ref=${encodeURIComponent(ref.branch)}`
  const { res, body } = await fetchJson(apiUrl, {
    timeoutMs: 20000,
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!res.ok || !Array.isArray(body)) return

  for (const entry of body) {
    if (acc.length >= limits.maxFiles) break
    if (!entry || typeof entry.path !== 'string') continue
    if (entry.type === 'dir') {
      await listGithubDir(ref, entry.path, depth + 1, acc, limits)
      continue
    }
    if (entry.type !== 'file') continue
    // Skip huge binaries
    if (typeof entry.size === 'number' && entry.size > limits.maxFileBytes) continue
    const rel = ref.dirPath
      ? entry.path.replace(new RegExp(`^${ref.dirPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`), '')
      : entry.path
    if (!rel || rel.includes('..')) continue

    let content = null
    if (entry.encoding === 'base64' && typeof entry.content === 'string') {
      content = Buffer.from(entry.content.replace(/\n/g, ''), 'base64')
    } else {
      // Directory listings rarely include content; fetch each file via Contents API
      // (raw.githubusercontent.com download_url is often blocked in some networks).
      try {
        const fileApi =
          `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${encodeURI(entry.path)}` +
          `?ref=${encodeURIComponent(ref.branch)}`
        const fileJson = await fetchJson(fileApi, {
          timeoutMs: 20000,
          headers: { Accept: 'application/vnd.github+json' },
        })
        if (fileJson.res.ok && fileJson.body?.encoding === 'base64' && typeof fileJson.body.content === 'string') {
          content = Buffer.from(fileJson.body.content.replace(/\n/g, ''), 'base64')
        } else if (entry.download_url) {
          const fileRes = await fetchText(entry.download_url, { timeoutMs: 20000 })
          if (fileRes.res.ok) content = Buffer.from(fileRes.text, 'utf8')
        }
      } catch {
        // skip this companion file
      }
    }
    if (content == null) continue
    acc.push({ relativePath: rel.replace(/\\/g, '/'), content })
  }
}

async function fetchGithubSkillPackage(skill) {
  const ref = resolveGithubRef(skill)
  if (!ref?.owner || !ref?.repo) {
    return { ok: false, error: '缺少 GitHub 仓库信息，无法下载 Skill 内容' }
  }

  // Always try SKILL.md first (works without GitHub API quota when possible)
  const md = await fetchGithubSkillMd(ref)
  if (!md.ok) return md

  const files = [{ relativePath: 'SKILL.md', content: Buffer.from(md.content, 'utf8') }]
  // Best-effort companion files (scripts, refs, etc.)
  try {
    if (ref.dirPath) {
      await listGithubDir(ref, ref.dirPath, 0, files, {
        maxDepth: 3,
        maxFiles: 40,
        maxFileBytes: 512 * 1024,
      })
    }
  } catch {
    // ignore companion fetch failures; SKILL.md is enough for a usable install
  }

  // Deduplicate by relativePath (prefer first = raw SKILL.md)
  const seen = new Set()
  const unique = []
  for (const f of files) {
    const key = f.relativePath.replace(/\\/g, '/')
    if (seen.has(key)) continue
    seen.add(key)
    unique.push({ ...f, relativePath: key })
  }

  return {
    ok: true,
    content: md.content,
    files: unique,
    source: `github:${ref.owner}/${ref.repo}@${ref.branch}`,
  }
}

async function fetchClawhubSkillPackage(skill) {
  const slug = skill.packageSource?.clawhubSlug || skill.skillId
  if (!slug) return { ok: false, error: '缺少 ClawHub slug' }
  const version = skill.latestVersion || skill.version

  // Prefer real SKILL.md file endpoint first (detail description is often only a summary).
  const fileUrl =
    `https://clawhub.ai/api/v1/skills/${encodeURIComponent(slug)}/file?path=${encodeURIComponent('SKILL.md')}` +
    (version && version !== 'latest' && version !== '0.0.0'
      ? `&version=${encodeURIComponent(version)}`
      : '')
  const file = await fetchText(fileUrl, { timeoutMs: 25000 })
  if (file.res.ok && file.text?.trim() && looksLikeFullSkillMarkdown(file.text)) {
    return {
      ok: true,
      content: file.text,
      files: [{ relativePath: 'SKILL.md', content: Buffer.from(file.text, 'utf8') }],
      source: `clawhub-file:${slug}`,
    }
  }

  const detailUrl = `https://clawhub.ai/api/v1/skills/${encodeURIComponent(slug)}`
  const detail = await fetchJson(detailUrl, { timeoutMs: 20000 })
  if (detail.res.ok && detail.body?.skill) {
    const body = detail.body.skill.description || detail.body.skill.summary || ''
    if (typeof body === 'string' && looksLikeFullSkillMarkdown(body)) {
      return {
        ok: true,
        content: body,
        files: [{ relativePath: 'SKILL.md', content: Buffer.from(body, 'utf8') }],
        source: `clawhub:${slug}`,
      }
    }
  }

  return {
    ok: false,
    error: `ClawHub 内容拉取失败 HTTP ${file.res.status || detail.res.status}`,
  }
}

function looksLikeFullSkillMarkdown(text) {
  if (!text || typeof text !== 'string') return false
  const t = text.trim()
  if (t.length < 80) return false
  if (/^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(t)) return true
  // Substantial markdown with headings / instructions, not a one-line summary
  if (t.length >= 400 && /(^|\n)#\s+\S/.test(t)) return true
  return false
}

/**
 * Minimal ZIP reader (store + deflate). Enough for SkillHub skill packages.
 */
function extractZipEntries(buffer) {
  const zlib = require('zlib')
  const files = []
  let offset = 0
  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset)
    if (sig !== 0x04034b50) break
    const flags = buffer.readUInt16LE(offset + 6)
    const compression = buffer.readUInt16LE(offset + 8)
    let compSize = buffer.readUInt32LE(offset + 18)
    const nameLen = buffer.readUInt16LE(offset + 26)
    const extraLen = buffer.readUInt16LE(offset + 28)
    const name = buffer.slice(offset + 30, offset + 30 + nameLen).toString('utf8')
    let dataStart = offset + 30 + nameLen + extraLen
    // Data descriptor: sizes after data — not supported for streaming; skip if bit3 and size 0
    if ((flags & 0x08) && compSize === 0) {
      // Heuristic: find next local header
      let next = dataStart
      while (next + 4 <= buffer.length) {
        if (buffer.readUInt32LE(next) === 0x04034b50 || buffer.readUInt32LE(next) === 0x02014b50) break
        next += 1
      }
      compSize = Math.max(0, next - dataStart)
    }
    const data = buffer.slice(dataStart, dataStart + compSize)
    offset = dataStart + compSize
    if (!name || name.endsWith('/')) continue
    const rel = name.replace(/^\/+/, '').replace(/\\/g, '/')
    if (!rel || rel.includes('..')) continue
    try {
      let content
      if (compression === 0) content = data
      else if (compression === 8) content = zlib.inflateRawSync(data)
      else continue
      files.push({ relativePath: rel, content })
    } catch {
      // skip corrupt entry
    }
  }
  return files
}

async function fetchBinary(url, { timeoutMs = 60000, headers = {} } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: '*/*', 'User-Agent': 'Nexus-SkillMesh/1.0', ...headers },
      signal: controller.signal,
      redirect: 'follow',
    })
    const buf = Buffer.from(await res.arrayBuffer())
    return { res, buf }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchSkillhubSkillPackage(skill = {}) {
  const src = skill.packageSource || {}
  const base = String(src.baseUrl || skill.registryUrl || '').replace(/\/+$/, '')
  const namespace = src.namespace || skill.namespace || 'global'
  const slug = src.slug || skill.skillId
  const version = src.version || skill.latestVersion || skill.version
  if (!base || !slug) {
    return { ok: false, error: '缺少 SkillHub 地址或 skill slug' }
  }

  const authHeaders = {}
  if (skill.token) authHeaders.Authorization = `Bearer ${skill.token}`

  const candidates = [
    version && version !== 'latest'
      ? `${base}/api/cli/v1/skills/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}/download`
      : null,
    `${base}/api/cli/v1/skills/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}/download`,
    version && version !== 'latest'
      ? `${base}/api/web/skills/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}/download`
      : null,
    `${base}/api/web/skills/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}/download`,
    `${base}/api/v1/skills/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}/download`,
  ].filter(Boolean)

  let lastError = 'SkillHub 下载失败'
  for (const url of candidates) {
    try {
      const { res, buf } = await fetchBinary(url, { timeoutMs: 90000, headers: authHeaders })
      if (!res.ok) {
        lastError = `SkillHub 下载失败 HTTP ${res.status}`
        continue
      }
      if (!buf?.length || buf[0] !== 0x50 || buf[1] !== 0x4b) {
        // Not a zip — maybe JSON error
        lastError = 'SkillHub 返回的不是技能包 zip'
        continue
      }
      const entries = extractZipEntries(buf)
      if (!entries.length) {
        lastError = 'SkillHub 技能包为空或无法解析'
        continue
      }
      const skillMd =
        entries.find((f) => /(^|\/)SKILL\.md$/i.test(f.relativePath)) ||
        entries.find((f) => /\.md$/i.test(f.relativePath))
      if (!skillMd) {
        lastError = '技能包中未找到 SKILL.md'
        continue
      }
      // Normalize root: if zip has single top folder, strip it for package root files
      const content = Buffer.isBuffer(skillMd.content)
        ? skillMd.content.toString('utf8')
        : String(skillMd.content)
      const prefixMatch = skillMd.relativePath.match(/^(.*\/)SKILL\.md$/i)
      const prefix = prefixMatch?.[1] || ''
      const files = entries.map((f) => {
        let rel = f.relativePath
        if (prefix && rel.startsWith(prefix)) rel = rel.slice(prefix.length)
        return { relativePath: rel || f.relativePath, content: f.content }
      })
      return {
        ok: true,
        content,
        files,
        source: `skillhub:${namespace}/${slug}@${version || 'latest'}`,
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'SkillHub 下载失败'
    }
  }
  return { ok: false, error: lastError }
}

/**
 * Fetch installable package content for a catalog skill.
 * @returns {{ ok: boolean, content?: string, files?: Array<{relativePath:string, content:Buffer|string}>, error?: string, source?: string }}
 */
async function fetchSkillPackageContent(skill = {}) {
  if (typeof skill.content === 'string' && skill.content.trim()) {
    return {
      ok: true,
      content: skill.content,
      files: [{ relativePath: 'SKILL.md', content: Buffer.from(skill.content, 'utf8') }],
      source: 'inline',
    }
  }

  const kind = skill.packageSource?.kind || skill.sourceId
  try {
    if (
      kind === 'skillhub' ||
      skill.packageSource?.baseUrl ||
      skill.sourceId === 'xfyun-skillhub' ||
      skill.sourceId === 'panguhub' ||
      (skill.registryUrl && (kind === 'custom' || kind === 'pangu'))
    ) {
      const hub = await fetchSkillhubSkillPackage(skill)
      if (hub.ok) return hub
      // fall through if github metadata also present
    }
    if (kind === 'clawhub' || skill.sourceId === 'clawhub' || skill.packageSource?.clawhubSlug) {
      const claw = await fetchClawhubSkillPackage(skill)
      if (claw.ok) return claw
    }
    if (
      kind === 'github' ||
      kind === 'skillsmp' ||
      kind === 'palebluedot' ||
      skill.packageSource?.githubUrl ||
      skill.packageSource?.owner ||
      skill.githubUrl
    ) {
      return await fetchGithubSkillPackage(skill)
    }
    if (kind === 'clawhub') return await fetchClawhubSkillPackage(skill)
    if (kind === 'skillhub' || skill.packageSource?.baseUrl) {
      return await fetchSkillhubSkillPackage(skill)
    }
    return { ok: false, error: '该技能源暂不支持自动下载完整内容' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '下载 Skill 内容失败' }
  }
}

module.exports = {
  parseGithubTreeUrl,
  skillDirFromSourcePath,
  resolveGithubRef,
  fetchSkillPackageContent,
  fetchGithubSkillPackage,
  fetchClawhubSkillPackage,
  fetchSkillhubSkillPackage,
}
