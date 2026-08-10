import { Link } from 'react-router-dom'
import type { AgentInstallation, Skill } from '@/types'
import { cn } from '@/lib/utils'

type Props = {
  agents: AgentInstallation[]
  skills: Skill[]
}

export function AgentMatrix({ agents, skills }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {agents.map((agent) => {
        const synced = skills.filter((s) => s.syncedAgents.includes(agent.id)).length
        return (
          <Link
            key={agent.id}
            to="/settings/agents"
            className={cn(
              'rounded border px-2.5 py-2.5 transition-colors',
              agent.installed
                ? 'border-[var(--dash-ok-border)] bg-[var(--dash-ok-bg)] hover:border-mesh-success'
                : 'border-mesh-border bg-mesh-panel hover:border-mesh-borderBright',
            )}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={cn('h-2 w-2 rounded-full', agent.installed ? 'bg-mesh-success shadow-[0_0_6px_var(--mesh-success)]' : 'bg-mesh-dim')}
              />
              <span className="truncate text-xs font-medium text-mesh-text">{agent.name}</span>
            </div>
            <div className="mt-1.5 text-[10px] text-mesh-dim">
              {agent.installed ? `已同步 ${synced}` : '离线'}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
