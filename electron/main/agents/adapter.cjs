/**
 * AgentAdapter contract for future link/unlink engines.
 *
 * detect() -> AgentInstallation | null
 * getSkillDirectory() -> string | null
 * linkSkill(skillPath) -> void
 * unlinkSkill(skillPath) -> void
 */
class AgentAdapter {
  async detect() {
    return null
  }
  async getSkillDirectory() {
    return null
  }
  async linkSkill() {
    throw new Error('Not implemented')
  }
  async unlinkSkill() {
    throw new Error('Not implemented')
  }
}

module.exports = { AgentAdapter }
