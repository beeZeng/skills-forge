import { cn } from '@/lib/utils'

/** Nexus brand mark — holographic hex crystal (user-selected). */
export function BrandMark({ className, title = 'Nexus' }: { className?: string; title?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}brand-mark.png`}
      alt={title}
      title={title}
      draggable={false}
      className={cn(
        'h-10 w-10 shrink-0 rounded-[10px] object-cover shadow-[0_2px_10px_rgba(0,0,0,0.35)] ring-1 ring-white/10',
        className,
      )}
    />
  )
}
