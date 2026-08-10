import { Link } from 'react-router-dom'
import { Sparkline, seriesHasActivity } from './Sparkline'
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
  series: number[]
  tone?: Tone
  /** What the sparkline represents, e.g. 近7日安装 */
  trendHint: string
  onNavigate?: () => void
}

export function KpiTile({ label, value, to, series, tone = 'accent', trendHint, onNavigate }: Props) {
  const color = TONE_COLOR[tone]
  const active = seriesHasActivity(series)
  return (
    <Link
      to={to}
      onClick={() => onNavigate?.()}
      className="dash-panel dash-kpi group block transition-colors hover:border-[var(--dash-panel-border-hover)]"
    >
      <div className="flex items-start justify-between gap-2 px-3 pb-1 pt-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--dash-header-text)]">{label}</div>
          <div className="mt-1 font-mono text-3xl font-semibold tabular-nums leading-none" style={{ color }}>
            {value}
          </div>
          <div className="mt-1.5 text-[10px] text-mesh-dim">{active ? trendHint : `${trendHint} · 暂无`}</div>
        </div>
        <Sparkline values={series} color={color} empty={!active} />
      </div>
      <div className={cn('mx-3 mb-3 mt-2 h-0.5 rounded-full opacity-70')} style={{ background: color }} />
    </Link>
  )
}
