import { Link } from 'react-router-dom'
import { useAppStore } from '@/stores/app-store'

export function AgentStatusRow() {
  const agents = useAppStore((s) => s.agents)
  const skills = useAppStore((s) => s.skills)

  const rows = agents.map((agent) => {
    const skillCount = skills.filter((s) => s.syncedAgents.includes(agent.id)).length
    return {
      id: agent.id,
      name: agent.name,
      installed: agent.installed,
      skillCount,
    }
  })

  return (
    <section className="hub-section">
      <div className="hub-section-head">
        <div>
          <h2 className="hub-section-title">我的智能体</h2>
          <p className="hub-section-sub">本机智能体连接状态与已同步技能数</p>
        </div>
        <Link to="/settings/agents" className="hub-link">
          管理 →
        </Link>
      </div>

      <div className="hub-agent-grid">
        {rows.length ? (
          rows.map((agent) => (
            <Link key={agent.id} to="/settings/agents" className="hub-agent-card">
              <div className="hub-agent-card-top">
                <h3>{agent.name}</h3>
                <span className={agent.installed ? 'live' : 'off'}>
                  <span className={agent.installed ? 'hub-dot hub-dot-live' : 'hub-dot'} />
                  {agent.installed ? '已连接' : '未发现'}
                </span>
              </div>
              <div className="hub-agent-card-stat">
                <span className="label">已同步技能</span>
                <span className="value">{agent.skillCount}</span>
              </div>
            </Link>
          ))
        ) : (
          <div className="hub-empty">未检测到本地智能体</div>
        )}
      </div>
    </section>
  )
}
