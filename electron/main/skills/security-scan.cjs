/**
 * Publish-time security checks for Skill packages (cross-platform, no shell).
 */

const fs = require('fs')
const path = require('path')
const { listFilesRecursive } = require('./zip-fs.cjs')

const DEFAULT_MAX_ZIP_BYTES = 50 * 1024 * 1024 // 50MB
const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024 // 25MB per file

const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.scr',
  '.ps1',
  '.vbs',
  '.vbe',
  '.jscript',
  '.wsf',
  '.wsh',
  '.dll',
  '.sys',
  '.drv',
])

const DANGEROUS_PATTERNS = [
  { id: 'rm-rf', re: /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)*\/?(?:\$HOME|~|\/)\b/i, label: '检测到危险删除命令 (rm -rf)' },
  { id: 'curl-bash', re: /curl\s+[^\n|]*\|\s*(ba)?sh/i, label: '检测到 curl | bash 管道' },
  { id: 'wget-bash', re: /wget\s+[^\n|]*\|\s*(ba)?sh/i, label: '检测到 wget | bash 管道' },
  { id: 'powershell-download', re: /Invoke-Expression\s*\(|IEX\s*\(|DownloadString\s*\(/i, label: '检测到 PowerShell 远程执行模式' },
  { id: 'format-disk', re: /\bformat\s+[a-z]:/i, label: '检测到磁盘格式化命令' },
]

const TEXT_SCAN_EXT = new Set([
  '.py',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.bat',
  '.cmd',
  '.md',
  '.txt',
  '.json',
  '.yml',
  '.yaml',
  '.toml',
  '.html',
  '.xml',
])

function safeRel(rel) {
  return String(rel || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\0/g, '')
}

function isUnsafePath(rel) {
  const r = safeRel(rel)
  if (!r) return true
  if (r.includes('..')) return true
  if (path.isAbsolute(r)) return true
  if (/^[a-zA-Z]:/.test(r)) return true
  return false
}

/**
 * @returns {{ ok: boolean, errors: string[], warnings: string[], stats?: object }}
 */
function scanSkillDirectory(dir, options = {}) {
  const errors = []
  const warnings = []
  const maxFileBytes = Number(options.maxFileBytes) > 0 ? Number(options.maxFileBytes) : DEFAULT_MAX_FILE_BYTES

  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return { ok: false, errors: ['技能目录无效'], warnings }
  }

  const files = listFilesRecursive(dir)
  let totalBytes = 0

  for (const rel of files) {
    if (isUnsafePath(rel)) {
      errors.push(`不安全路径：${rel}`)
      continue
    }

    const full = path.join(dir, ...rel.split('/'))
    let stat
    try {
      stat = fs.statSync(full)
    } catch {
      errors.push(`无法读取文件：${rel}`)
      continue
    }
    if (!stat.isFile()) continue

    totalBytes += stat.size
    if (stat.size > maxFileBytes) {
      errors.push(`文件过大（>${Math.round(maxFileBytes / 1024 / 1024)}MB）：${rel}`)
    }

    const ext = path.extname(rel).toLowerCase()
    if (BLOCKED_EXTENSIONS.has(ext)) {
      errors.push(`禁止的文件类型：${rel}`)
    }

    if (TEXT_SCAN_EXT.has(ext) && stat.size <= 2 * 1024 * 1024) {
      let text = ''
      try {
        text = fs.readFileSync(full, 'utf8')
      } catch {
        continue
      }
      for (const rule of DANGEROUS_PATTERNS) {
        if (rule.re.test(text)) {
          errors.push(`${rule.label}：${rel}`)
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: { fileCount: files.length, totalBytes },
  }
}

/**
 * Validate uploaded zip before extract.
 */
function scanZipFile(zipPath, options = {}) {
  const errors = []
  const warnings = []
  const maxZipBytes = Number(options.maxZipBytes) > 0 ? Number(options.maxZipBytes) : DEFAULT_MAX_ZIP_BYTES

  if (!zipPath || !fs.existsSync(zipPath)) {
    return { ok: false, errors: ['zip 文件不存在'], warnings }
  }
  if (!/\.zip$/i.test(zipPath)) {
    return { ok: false, errors: ['仅支持 .zip 格式'], warnings }
  }

  const stat = fs.statSync(zipPath)
  if (!stat.isFile()) return { ok: false, errors: ['上传路径不是文件'], warnings }
  if (stat.size <= 0) return { ok: false, errors: ['zip 文件为空'], warnings }
  if (stat.size > maxZipBytes) {
    return {
      ok: false,
      errors: [`zip 超过大小限制（${Math.round(maxZipBytes / 1024 / 1024)}MB）`],
      warnings,
    }
  }

  return { ok: true, errors, warnings, stats: { zipBytes: stat.size } }
}

module.exports = {
  scanSkillDirectory,
  scanZipFile,
  isUnsafePath,
  DEFAULT_MAX_ZIP_BYTES,
  DEFAULT_MAX_FILE_BYTES,
  BLOCKED_EXTENSIONS,
}
