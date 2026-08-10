import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  meta,
  actions,
  className,
}: {
  title?: string
  description?: string
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {title ? <h1 className="text-2xl font-semibold tracking-tight text-mesh-text">{title}</h1> : null}
        {description ? (
          <p className={cn('text-sm text-mesh-muted', title ? 'mt-1.5' : '')}>{description}</p>
        ) : null}
        {meta ? <div className={cn('flex flex-wrap items-center gap-2', title || description ? 'mt-3' : '')}>{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
