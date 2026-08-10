import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent' | 'violet'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-mesh-panel text-mesh-muted ring-mesh-border',
  success: 'bg-mesh-success/10 text-mesh-success ring-mesh-success/25',
  warning: 'bg-mesh-warning/10 text-mesh-warning ring-mesh-warning/25',
  danger: 'bg-mesh-danger/10 text-mesh-danger ring-mesh-danger/25',
  accent: 'bg-mesh-accentSoft text-mesh-accent ring-mesh-accent/25',
  violet: 'bg-[color-mix(in_srgb,var(--mesh-violet)_12%,transparent)] text-[var(--mesh-violet)] ring-[color-mix(in_srgb,var(--mesh-violet)_25%,transparent)]',
}

export function StatusBadge({
  label,
  tone = 'neutral',
  dot,
  className,
}: {
  label: string
  tone?: Tone
  dot?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {label}
    </span>
  )
}
