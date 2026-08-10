import { Check, Clock, Download, Star } from 'lucide-react'
import type { Skill, SkillBadge } from '@/types'
import { cn, formatCount, formatRelative, skillInstalls } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'
import { StatusBadge } from '@/components/common/StatusBadge'

const BADGE_LABEL: Record<SkillBadge, string> = {
  new: '新发布',
  editor: '编辑推荐',
  fast_growth: '快速增长',
  hot: '热门',
}

function SkillBadges({ badges }: { badges?: SkillBadge[] }) {
  if (!badges?.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {badges.slice(0, 2).map((badge) => (
        <span
          key={badge}
          className={cn(
            'rounded-md px-1.5 py-0.5 text-[10px] font-medium',
            badge === 'hot' && 'bg-mesh-accentSoft text-mesh-accent',
            badge === 'new' && 'bg-emerald-500/10 text-emerald-600',
            badge === 'fast_growth' && 'bg-amber-500/10 text-amber-700',
            badge === 'editor' && 'bg-violet-500/10 text-violet-700',
          )}
        >
          {BADGE_LABEL[badge]}
        </span>
      ))}
    </div>
  )
}

function DeployAction({ skill }: { skill: Skill }) {
  const installSkill = useAppStore((s) => s.installSkill)
  const updateSkill = useAppStore((s) => s.updateSkill)
  const running = useAppStore((s) =>
    s.tasks.some(
      (t) =>
        t.skillUid === skill.uid &&
        (t.status === 'running' || t.status === 'pending') &&
        (t.kind === 'install' || t.kind === 'update'),
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
        className="rounded-lg bg-mesh-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-mesh-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? '部署中…' : '部署'}
      </button>
    )
  }

  if (skill.updateAvailable) {
    return (
      <div className="flex items-center gap-2">
        <StatusBadge label="可更新" tone="warning" />
        <button
          type="button"
          disabled={running}
          onClick={(e) => {
            e.stopPropagation()
            updateSkill(skill.uid)
          }}
          className="rounded-lg bg-mesh-warning px-2.5 py-1 text-xs font-medium text-black hover:bg-mesh-warning/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? '更新中…' : '更新'}
        </button>
      </div>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-mesh-success">
      <Check className="h-3.5 w-3.5" /> 已安装
    </span>
  )
}

export function SkillCard({ skill }: { skill: Skill }) {
  const openSkill = useAppStore((s) => s.openSkill)
  const toggleFavorite = useAppStore((s) => s.toggleFavorite)
  const batchMode = useAppStore((s) => s.batchMode)
  const selected = useAppStore((s) => s.selectedUids.includes(skill.uid))
  const toggleSelected = useAppStore((s) => s.toggleSelected)

  const status = !skill.installed
    ? null
    : skill.updateAvailable
      ? { label: '可更新', tone: 'warning' as const }
      : { label: '已安装', tone: 'success' as const }

  const installs = skillInstalls(skill)
  const favorites = skill.favoriteCount ?? (skill.favorite ? 1 : 0)

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => openSkill(skill.uid)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') openSkill(skill.uid)
      }}
      className="ws-card group cursor-pointer p-4"
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
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mesh-accentSoft text-sm font-semibold text-mesh-accent">
          {skill.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-medium text-mesh-text">{skill.name}</h3>
            <button
              type="button"
              className="rounded-lg p-1 text-mesh-dim hover:text-mesh-warning"
              onClick={(e) => {
                e.stopPropagation()
                toggleFavorite(skill.uid)
              }}
              aria-label="收藏"
            >
              <Star className={cn('h-4 w-4', skill.favorite && 'fill-mesh-warning text-mesh-warning')} />
            </button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="truncate text-xs text-mesh-dim">{skill.sourceName}</span>
            {status ? <StatusBadge label={status.label} tone={status.tone} /> : null}
            <SkillBadges badges={skill.badges} />
          </div>
        </div>
      </div>

      <p className="mb-3 line-clamp-2 min-h-[40px] text-sm leading-5 text-mesh-muted">
        {skill.description || '暂无描述'}
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-mesh-dim">
        <span className="inline-flex items-center gap-1" title="安装量">
          <Download className="h-3 w-3" />
          {formatCount(installs)} 安装
        </span>
        <span className="inline-flex items-center gap-1" title="收藏量">
          <Star className="h-3 w-3" />
          {formatCount(favorites)} 收藏
        </span>
        {skill.updatedAt ? (
          <span className="inline-flex items-center gap-1" title={skill.updatedAt}>
            <Clock className="h-3 w-3" />
            {formatRelative(skill.updatedAt)}
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-mesh-border/80 pt-3">
        <span className="font-mono text-xs text-mesh-dim">v{skill.latestVersion || skill.version}</span>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="rounded-lg border border-mesh-border px-2.5 py-1 text-xs text-mesh-muted hover:bg-mesh-bg hover:text-mesh-text"
            onClick={() => openSkill(skill.uid)}
          >
            查看
          </button>
          <DeployAction skill={skill} />
        </div>
      </div>
    </article>
  )
}
