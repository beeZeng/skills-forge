/**
 * Resolve disk volume capacity for a path (skills root drive).
 */

const fs = require('fs')
const path = require('path')

function toGb(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 0
  return Math.round((bytes / (1024 ** 3)) * 10) / 10
}

function volumeLabelFor(targetPath) {
  const normalized = path.resolve(targetPath || '.')
  if (process.platform === 'win32') {
    const m = normalized.match(/^([a-zA-Z]:)/)
    return m ? `${m[1].toUpperCase()}\\` : normalized.slice(0, 3)
  }
  return '/'
}

function dirUsedBytes(rootDir, { maxEntries = 200000 } = {}) {
  let total = 0
  let count = 0
  const stack = [rootDir]
  while (stack.length) {
    const current = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (count >= maxEntries) return total
      count += 1
      const full = path.join(current, entry.name)
      try {
        if (entry.isDirectory()) {
          stack.push(full)
        } else if (entry.isFile()) {
          total += fs.statSync(full).size
        }
      } catch {
        // skip inaccessible
      }
    }
  }
  return total
}

/**
 * @param {string} targetPath absolute path on the volume to inspect
 */
function getDiskSpace(targetPath) {
  const resolved = path.resolve(targetPath || process.cwd())
  let probe = resolved
  try {
    if (!fs.existsSync(probe)) {
      probe = path.dirname(probe)
    }
  } catch {
    probe = process.cwd()
  }

  try {
    const st = typeof fs.statfsSync === 'function' ? fs.statfsSync(probe) : null
    if (!st) {
      return {
        ok: false,
        error: '当前运行时不支持磁盘容量查询',
        path: resolved,
        volumeLabel: volumeLabelFor(resolved),
      }
    }
    const block = Number(st.bsize || st.f_bsize || 0)
    const blocks = Number(st.blocks || st.f_blocks || 0)
    const avail = Number(st.bavail ?? st.blocksAvailable ?? st.f_bavail ?? 0)
    const free = Number(st.bfree ?? st.f_bfree ?? avail)
    const totalBytes = block * blocks
    const freeBytes = block * (avail || free)
    const usedBytes = Math.max(0, totalBytes - freeBytes)
    let skillsUsedBytes = 0
    try {
      if (fs.existsSync(resolved)) skillsUsedBytes = dirUsedBytes(resolved)
    } catch {
      skillsUsedBytes = 0
    }
    return {
      ok: true,
      path: resolved,
      volumeLabel: volumeLabelFor(resolved),
      totalBytes,
      freeBytes,
      usedBytes,
      skillsUsedBytes,
      totalGb: toGb(totalBytes),
      freeGb: toGb(freeBytes),
      usedGb: toGb(usedBytes),
      skillsUsedGb: toGb(skillsUsedBytes),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '磁盘容量查询失败',
      path: resolved,
      volumeLabel: volumeLabelFor(resolved),
    }
  }
}

module.exports = {
  getDiskSpace,
  toGb,
  volumeLabelFor,
  dirUsedBytes,
}
