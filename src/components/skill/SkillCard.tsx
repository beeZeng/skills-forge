import { Check, Star } from 'lucide-react'
import type { Skill } from '@/types'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'

function InstallAction({ skill }: { skill: Skill }) {
  const installSkill = useAppStore((s) => s.installSkill)
  const updateSkill = useAppStore((s) => s.updateSkill)
  const running = useAppStore((s) =>
    s.tasks.some(
      (t) => t.skillUid === skill.uid && (t.status === 'running' || t.status === 'pending') && (t.kind === 'install' || t.kind === 'update'),
    ),
  )

  if (!skill.installed) {
    return (
      <button
        type="button"
        disabled={running}
        onClick={(e) => {
          e.stopPropagation()
          installSkill(skill.uid)
        }}
        className="rounded-md bg-mesh-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-mesh-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? '安装中...' : '安装'}
      </button>
    )
  }

  if (skill.updateAvailable) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-mesh-warning">有更新</span>
        <button
          type="button"
          disabled={running}
          onClick={(e) => {
            e.stopPropagation()
            updateSkill(skill.uid)
          }}
          className="rounded-md bg-mesh-warning px-2.5 py-1 text-xs font-medium text-black hover:bg-mesh-warning/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? '更新中...' : '更新'}
        </button>
      </div>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-mesh-success">
      <Check className="h-3.5 w-3.5" /> 已安装 · 最新
    </span>
  )
}

export function SkillCard({ skill }: { skill: Skill }) {
  const openSkill = useAppStore((s) => s.openSkill)
  const toggleFavorite = useAppStore((s) => s.toggleFavorite)
  const batchMode = useAppStore((s) => s.batchMode)
  const selected = useAppStore((s) => s.selectedUids.includes(skill.uid))
  const toggleSelected = useAppStore((s) => s.toggleSelected)

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => openSkill(skill.uid)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') openSkill(skill.uid)
      }}
      className="group cursor-pointer rounded-mesh border border-mesh-border bg-mesh-card p-4 shadow-sm transition-colors hover:border-mesh-borderBright hover:bg-mesh-cardHover"
    >
      <div className="mb-3 flex items-start gap-3">
        {batchMode ? (
          <input
            type="checkbox"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleSelected(skill.uid)}
            className="mt-1"
          />
        ) : null}
        <div className="flex h-10 w-10 items-center justify-center rounded-mesh bg-mesh-accentSoft text-sm font-semibold text-mesh-accent">
          {skill.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-medium text-mesh-text">{skill.name}</h3>
            <button
              type="button"
              className="rounded p-1 text-mesh-dim hover:text-mesh-warning"
              onClick={(e) => {
                e.stopPropagation()
                toggleFavorite(skill.uid)
              }}
              aria-label="收藏"
            >
              <Star className={cn('h-4 w-4', skill.favorite && 'fill-mesh-warning text-mesh-warning')} />
            </button>
          </div>
          <div className="mt-0.5 truncate text-xs text-mesh-dim">
            {skill.sourceName}
            {skill.namespace ? ` · ${skill.namespace}/${skill.skillId}` : ''}
          </div>
        </div>
      </div>

      <p className="mb-3 line-clamp-2 min-h-[40px] text-sm leading-5 text-mesh-muted">{skill.description}</p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {skill.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded-md bg-mesh-panel px-1.5 py-0.5 text-[11px] text-mesh-muted">
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-mesh-border/80 pt-3">
        <span className="font-mono text-xs text-mesh-dim">v{skill.version}</span>
        <InstallAction skill={skill} />
      </div>
    </article>
  )
}
