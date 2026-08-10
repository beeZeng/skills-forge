import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Shared content frame under NexusHeader. */
export function WorkspaceContainer({
  children,
  className,
  wide = false,
  flush = false,
}: {
  children: ReactNode
  className?: string
  /** Wider content (hub-style home). */
  wide?: boolean
  /** No horizontal padding (hub full-bleed sections). */
  flush?: boolean
}) {
  return (
    <div
      className={cn(
        'ws-page mx-auto w-full',
        flush ? 'max-w-none px-0 py-0' : wide ? 'max-w-[1400px] px-6 py-5' : 'max-w-[1200px] px-6 py-5',
        className,
      )}
    >
      {children}
    </div>
  )
}
