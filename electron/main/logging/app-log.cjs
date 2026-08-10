/**
 * Daily rotating runtime logs for troubleshooting.
 * Files: {logsDir}/YYYY-MM-DD.log — retain 7 days.
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

const RETAIN_DAYS = 7

let logsDir = ''
let hooked = false

function pad(n) {
  return String(n).padStart(2, '0')
}

function dateStamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function ensureLogsDir(dir) {
  if (!dir) return ''
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function initAppLog(dataRoot) {
  logsDir = ensureLogsDir(path.join(dataRoot, 'logs'))
  purgeOldLogs()
  hookConsole()
  write('info', `Nexus started · pid=${process.pid} · platform=${process.platform} ${os.release()}`)
  return getLogInfo()
}

function todayLogPath() {
  if (!logsDir) return ''
  return path.join(logsDir, `${dateStamp()}.log`)
}

function purgeOldLogs() {
  if (!logsDir || !fs.existsSync(logsDir)) return { ok: true, removed: [] }
  const removed = []
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000
  let entries = []
  try {
    entries = fs.readdirSync(logsDir)
  } catch {
    return { ok: false, removed }
  }
  for (const name of entries) {
    if (!/^\d{4}-\d{2}-\d{2}\.log$/i.test(name)) continue
    const full = path.join(logsDir, name)
    try {
      const stamp = name.slice(0, 10)
      const fileDate = new Date(`${stamp}T00:00:00`)
      const mtime = fs.statSync(full).mtimeMs
      const tooOldByName = Number.isFinite(fileDate.getTime()) && fileDate.getTime() < cutoff
      const tooOldByMtime = mtime < cutoff
      if (tooOldByName || tooOldByMtime) {
        fs.unlinkSync(full)
        removed.push(name)
      }
    } catch {
      // skip
    }
  }
  return { ok: true, removed }
}

function write(level, message, meta) {
  if (!logsDir) return { ok: false, error: '日志目录未初始化' }
  try {
    purgeOldLogs()
    ensureLogsDir(logsDir)
    const file = todayLogPath()
    const ts = new Date().toISOString()
    const extra = meta != null ? ` ${typeof meta === 'string' ? meta : JSON.stringify(meta)}` : ''
    const line = `${ts} [${String(level || 'info').toUpperCase()}] ${String(message || '')}${extra}\n`
    fs.appendFileSync(file, line, 'utf8')
    return { ok: true, file }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '写日志失败' }
  }
}

function hookConsole() {
  if (hooked || !logsDir) return
  hooked = true
  const wrap = (level, original) =>
    (...args) => {
      try {
        const text = args
          .map((a) => {
            if (typeof a === 'string') return a
            try {
              return JSON.stringify(a)
            } catch {
              return String(a)
            }
          })
          .join(' ')
        write(level, text)
      } catch {
        // never break console
      }
      return original.apply(console, args)
    }
  console.log = wrap('info', console.log.bind(console))
  console.info = wrap('info', console.info.bind(console))
  console.warn = wrap('warn', console.warn.bind(console))
  console.error = wrap('error', console.error.bind(console))
}

function getLogInfo(homeDir) {
  const file = todayLogPath()
  const displayRoot = logsDir
    ? logsDir.replace(homeDir || os.homedir(), '~').replace(/\\/g, '/')
    : ''
  const displayFile = file
    ? file.replace(homeDir || os.homedir(), '~').replace(/\\/g, '/')
    : ''
  return {
    ok: Boolean(logsDir),
    logsDir,
    logsDirDisplay: displayRoot,
    todayFile: file,
    todayFileDisplay: displayFile,
    retainDays: RETAIN_DAYS,
  }
}

module.exports = {
  initAppLog,
  write,
  purgeOldLogs,
  getLogInfo,
  todayLogPath,
  RETAIN_DAYS,
}
