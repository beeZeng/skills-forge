const assert = require('assert')
const {
  parseSemVer,
  isValidSemVer,
  compareSemVer,
  isNewer,
} = require('../electron/main/update/semver.cjs')

assert.deepStrictEqual(parseSemVer('1.2.3'), { raw: '1.2.3', major: 1, minor: 2, patch: 3 })
assert.ok(isValidSemVer('v1.0.0'))
assert.equal(isValidSemVer('1.0'), false)
assert.equal(compareSemVer('1.0.0', '1.0.1'), -1)
assert.equal(compareSemVer('2.0.0', '1.9.9'), 1)
assert.equal(compareSemVer('1.0.0', '1.0.0'), 0)
assert.equal(isNewer('1.0.1', '1.0.0'), true)
assert.equal(isNewer('1.0.0', '1.0.1'), false)
console.log('semver smoke ok')
