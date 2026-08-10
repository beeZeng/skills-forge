import type { TaskItem, TaskKind } from '@/types'

type Props = {
  values: number[]
  color?: string
  width?: number
  height?: number
  empty?: boolean
}

/** Bucket tasks into a fixed-length daily series (oldest → newest). */
export function dailyTaskSeries(
  tasks: Array<Pick<TaskItem, 'createdAt' | 'kind' | 'status'>>,
  options: {
    days?: number
    kinds?: TaskKind[]
    successOnly?: boolean
  } = {},
): number[] {
  const days = options.days ?? 7
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const keys: string[] = []
  const counts = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const key = d.toDateString()
    keys.push(key)
    counts.set(key, 0)
  }

  for (const task of tasks) {
    if (options.kinds && !options.kinds.includes(task.kind)) continue
    if (options.successOnly && task.status !== 'success') continue
    const key = new Date(task.createdAt).toDateString()
    if (!counts.has(key)) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return keys.map((key) => counts.get(key) ?? 0)
}

export function seriesHasActivity(values: number[]) {
  return values.some((v) => v > 0)
}

export function Sparkline({ values, color = 'var(--mesh-accent)', width = 96, height = 28, empty }: Props) {
  if (!values.length) return null

  const inactive = empty ?? !seriesHasActivity(values)
  const stroke = inactive ? 'var(--mesh-dim)' : color
  const min = inactive ? 0 : Math.min(...values)
  const max = inactive ? 1 : Math.max(...values)
  const span = max - min || 1
  const pad = 2
  const points = values
    .map((v, i) => {
      const x = pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2)
      const y = inactive
        ? height - pad - 2
        : height - pad - ((v - min) / span) * (height - pad * 2)
      return `${x},${y}`
    })
    .join(' ')

  const area = `0,${height} ${points} ${width},${height}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      {!inactive ? <polyline points={area} fill={stroke} fillOpacity={0.12} stroke="none" /> : null}
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeOpacity={inactive ? 0.45 : 1}
        strokeDasharray={inactive ? '3 3' : undefined}
      />
    </svg>
  )
}
