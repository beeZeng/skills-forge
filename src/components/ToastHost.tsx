import { useEffect } from 'react'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'

export function ToastHost() {
  const toast = useAppStore((s) => s.toast)
  const clearToast = useAppStore((s) => s.clearToast)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => clearToast(), 3200)
    return () => window.clearTimeout(timer)
  }, [toast, clearToast])

  if (!toast) return null

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[300] -translate-x-1/2 px-4">
      <div
        className={cn(
          'pointer-events-auto max-w-md rounded-mesh border px-4 py-2.5 text-sm shadow-mesh',
          toast.tone === 'success' && 'border-mesh-success/40 bg-mesh-panel text-mesh-success',
          toast.tone === 'error' && 'border-mesh-danger/40 bg-mesh-panel text-mesh-danger',
          toast.tone === 'warning' && 'border-mesh-warning/40 bg-mesh-panel text-mesh-warning',
          toast.tone === 'info' && 'border-mesh-border bg-mesh-panel text-mesh-text',
        )}
      >
        {toast.message}
      </div>
    </div>
  )
}
