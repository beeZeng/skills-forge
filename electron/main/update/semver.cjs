/**
 * Minimal SemVer (Major.Minor.Patch) helpers — prerelease/build ignored for compare.
 */

function parseSemVer(input) {
  const raw = String(input || '').trim().replace(/^v/i, '')
  const m = raw.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  if (!m) return null
  return {
    raw,
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
  }
}

function isValidSemVer(input) {
  return Boolean(parseSemVer(input))
}

/** @returns {-1|0|1|null} null if either side invalid */
function compareSemVer(a, b) {
  const left = parseSemVer(a)
  const right = parseSemVer(b)
  if (!left || !right) return null
  if (left.major !== right.major) return left.major < right.major ? -1 : 1
  if (left.minor !== right.minor) return left.minor < right.minor ? -1 : 1
  if (left.patch !== right.patch) return left.patch < right.patch ? -1 : 1
  return 0
}

function isNewer(candidate, current) {
  return compareSemVer(candidate, current) === 1
}

module.exports = {
  parseSemVer,
  isValidSemVer,
  compareSemVer,
  isNewer,
}
