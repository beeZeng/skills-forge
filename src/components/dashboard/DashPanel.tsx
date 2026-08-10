import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export function DashPanel({ title, action, children, className, bodyClassName }: Props) {
  return (
    <section className={cn('dash-panel flex min-h-0 flex-col overflow-hidden', className)}>
      <header className="dash-panel-header flex items-center justify-between gap-2 px-3 py-2">
        <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--dash-header-text)]">
          {title}
        </h2>
        {action ? <div className="shrink-0 text-[11px]">{action}</div> : null}
      </header>
      <div className={cn('min-h-0 flex-1 p-3', bodyClassName)}>{children}</div>
    </section>
  )
}
