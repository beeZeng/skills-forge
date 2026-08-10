import { Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Indeterminate progress + status text while catalog refresh runs. */
export function CatalogSyncBar({
  active,
  message,
  className,
}: {
  active: boolean
  message?: string | null
  className?: string
}) {
  if (!active) return null
  return (
    <div
      className={cn(
        'overflow-hidden rounded-mesh border border-mesh-accent/30 bg-mesh-accentSoft/35 px-4 py-3',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-2 text-sm text-mesh-text">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-mesh-accent" />
        <span className="font-medium">{message || '正在刷新技能列表…'}</span>
        <span className="text-xs text-mesh-dim">请稍候，勿重复点击</span>
      </div>
      <div className="catalog-sync-track mt-2.5">
        <div className="catalog-sync-bar" />
      </div>
    </div>
  )
}

type RefreshButtonProps = {
  busy: boolean
  onClick: () => void
  label?: string
  busyLabel?: string
  className?: string
  size?: 'sm' | 'md'
  disabled?: boolean
}

/** Refresh button with spinner; disabled while busy to prevent double submit. */
export function CatalogRefreshButton({
  busy,
  onClick,
  label = '刷新列表',
  busyLabel = '刷新中…',
  className,
  size = 'sm',
  disabled = false,
}: RefreshButtonProps) {
  const locked = busy || disabled
  return (
    <button
      type="button"
      disabled={locked}
      aria-busy={busy}
      onClick={() => {
        if (locked) return
        onClick()
      }}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-mesh border border-mesh-border text-mesh-muted transition-colors',
        'hover:bg-mesh-card hover:text-mesh-text',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'px-3 py-2 text-sm text-mesh-text' : 'px-3 py-1.5 text-xs',
        busy && 'border-mesh-accent/40 bg-mesh-accentSoft/30 text-mesh-accent',
        className,
      )}
    >
      {busy ? (
        <Loader2 className={cn('shrink-0 animate-spin', size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
      ) : (
        <RefreshCw className={cn('shrink-0', size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
      )}
      {busy ? busyLabel : label}
    </button>
  )
}
