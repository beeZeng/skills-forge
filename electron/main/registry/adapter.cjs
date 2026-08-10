/**
 * RegistryAdapter contract (JSDoc). Real adapters will implement these methods.
 *
 * search(query) -> Skill[]
 * getSkill(skillId) -> Skill
 * download(skillId, version?) -> localPath
 * getLatestVersion(skillId) -> version
 */
class RegistryAdapter {
  async search() {
    throw new Error('Not implemented')
  }
  async getSkill() {
    throw new Error('Not implemented')
  }
  async download() {
    throw new Error('Not implemented')
  }
  async getLatestVersion() {
    throw new Error('Not implemented')
  }
}

module.exports = { RegistryAdapter }
