import { useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'

type Props = {
  /** Friendly label shown by default (e.g. 本地技能目录). */
  label: string
  /** Real filesystem path; hidden until revealed. */
  path?: string | null
  /** Optional secondary hint under the label. */
  hint?: string
  className?: string
  /** Compact inline variant for dense detail rows. */
  compact?: boolean
}

/**
 * Masks OS paths by default. Click to reveal the real path (Windows / macOS safe UX).
 */
export function PathReveal({ label, path, hint, className, compact }: Props) {
  const [open, setOpen] = useState(false)
  const hasPath = Boolean(path && path !== '-' && path.trim())

  const copy = () => {
    if (!hasPath || !path) return
    void (async () => {
      try {
        await navigator.clipboard.writeText(path)
        useAppStore.getState().showToast('已复制路径', 'success')
      } catch {
        useAppStore.getState().showToast('复制失败', 'error')
      }
    })()
  }

  if (!hasPath) {
    return (
      <div className={cn(compact ? 'text-xs' : 'text-xs', className)}>
        <span className="text-mesh-muted">{label}</span>
        <span className="ml-2 text-mesh-dim">未设置</span>
      </div>
    )
  }

  return (
    <div className={cn('min-w-0', className)}>
      <button
        type="button"
        className={cn(
          'inline-flex max-w-full items-center gap-1.5 rounded-md text-left transition-colors hover:text-mesh-text',
          compact ? 'text-xs text-mesh-muted' : 'text-xs text-mesh-muted',
        )}
        onClick={() => setOpen((v) => !v)}
        title={open ? '隐藏真实路径' : '查看真实路径'}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        {open ? <EyeOff className="h-3.5 w-3.5 shrink-0 opacity-70" /> : <Eye className="h-3.5 w-3.5 shrink-0 opacity-70" />}
        <span className="truncate font-medium text-mesh-text">{label}</span>
      </button>
      {hint && !open ? <p className="mt-0.5 pl-5 text-[11px] text-mesh-dim">{hint}</p> : null}
      {open ? (
        <div className="mt-1.5 flex items-start gap-2 rounded-md border border-mesh-border bg-mesh-panel/80 px-2.5 py-2">
          <code className="min-w-0 flex-1 break-all font-mono text-[11px] leading-relaxed text-mesh-muted">{path}</code>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 rounded border border-mesh-border px-1.5 py-0.5 text-[10px] text-mesh-dim hover:bg-mesh-card hover:text-mesh-text"
            onClick={copy}
          >
            <Copy className="h-3 w-3" />
            复制
          </button>
        </div>
      ) : null}
    </div>
  )
}
