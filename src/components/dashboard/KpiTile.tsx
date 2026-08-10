import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

type Tone = 'accent' | 'success' | 'warning' | 'danger'

const TONE_COLOR: Record<Tone, string> = {
  accent: 'var(--mesh-accent)',
  success: 'var(--mesh-success)',
  warning: 'var(--mesh-warning)',
  danger: 'var(--mesh-danger)',
}

type Props = {
  label: string
  value: number
  to: string
  tone?: Tone
  onNavigate?: () => void
}

export function KpiTile({ label, value, to, tone = 'accent', onNavigate }: Props) {
  const color = TONE_COLOR[tone]
  return (
    <Link
      to={to}
      onClick={() => onNavigate?.()}
      className="dash-panel dash-kpi group block transition-colors hover:border-[var(--dash-panel-border-hover)]"
    >
      <div className="px-3 pb-1 pt-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--dash-header-text)]">{label}</div>
        <div className="mt-1 font-mono text-3xl font-semibold tabular-nums leading-none" style={{ color }}>
          {value}
        </div>
      </div>
      <div className={cn('mx-3 mb-3 mt-2 h-0.5 rounded-full opacity-70')} style={{ background: color }} />
    </Link>
  )
}
