import { Link } from 'react-router-dom'
import type { Skill, SkillSource, SourceStatus } from '@/types'
import { cn } from '@/lib/utils'

type Props = {
  sources: SkillSource[]
  skills: Skill[]
}

const STATUS_LABEL: Record<SourceStatus, string> = {
  connected: '已连接',
  checking: '检测中',
  disconnected: '未连接',
}

function sourceTone(source: SkillSource) {
  if (!source.enabled) return 'off' as const
  if (source.status === 'connected') return 'ok' as const
  if (source.status === 'checking') return 'warn' as const
  return 'err' as const
}

export function SourceMatrix({ sources, skills }: Props) {
  const list = sources.filter((s) => s.id !== 'local')
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {list.map((source) => {
        const count = skills.filter((s) => s.sourceId === source.id).length
        const tone = sourceTone(source)
        return (
          <Link
            key={source.id}
            to="/settings/sources"
            className={cn(
              'rounded border px-2.5 py-2.5 transition-colors',
              tone === 'ok' && 'border-[var(--dash-ok-border)] bg-[var(--dash-ok-bg)] hover:border-mesh-success',
              tone === 'warn' && 'border-[var(--dash-warn-border)] bg-[var(--dash-warn-bg)] hover:border-mesh-warning',
              tone === 'err' && 'border-[var(--dash-err-border)] bg-[var(--dash-err-bg)] hover:border-mesh-danger',
              tone === 'off' && 'border-mesh-border bg-mesh-panel hover:border-mesh-borderBright',
            )}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  tone === 'ok' && 'bg-mesh-success shadow-[0_0_6px_var(--mesh-success)]',
                  tone === 'warn' && 'bg-mesh-warning shadow-[0_0_6px_var(--mesh-warning)]',
                  tone === 'err' && 'bg-mesh-danger shadow-[0_0_6px_var(--mesh-danger)]',
                  tone === 'off' && 'bg-mesh-dim',
                )}
              />
              <span className="truncate text-xs font-medium text-mesh-text">{source.name}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-mesh-dim">
              <span>
                {!source.enabled
                  ? '已禁用'
                  : STATUS_LABEL[source.status]}
              </span>
              <span>{count} 个 Skill</span>
            </div>
          </Link>
        )
      })}
      {!list.length ? <div className="col-span-full py-6 text-center text-xs text-mesh-dim">暂无技能源</div> : null}
    </div>
  )
}
