const skillhub = require('./skillhub.cjs')
const clawhub = require('./clawhub.cjs')
const marketplace = require('./marketplace.cjs')

function pickClient(payload = {}) {
  if (marketplace.isMarketplaceSource(payload)) return marketplace
  if (clawhub.isClawHubSource(payload)) return clawhub
  return skillhub
}

async function testConnection(payload = {}) {
  return pickClient(payload).testConnection(payload)
}

async function listSkills(payload = {}) {
  return pickClient(payload).listSkills(payload)
}

module.exports = {
  testConnection,
  listSkills,
  isClawHubSource: clawhub.isClawHubSource,
  isMarketplaceSource: marketplace.isMarketplaceSource,
}
