import { Link } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { AgentMatrix } from '@/components/dashboard/AgentMatrix'
import { DashPanel } from '@/components/dashboard/DashPanel'
import { KpiTile } from '@/components/dashboard/KpiTile'
import { SourceMatrix } from '@/components/dashboard/SourceMatrix'
import { selectLatestDiscoverSkills, useAppStore } from '@/stores/app-store'
import type { TaskKind, TaskStatus } from '@/types'
import { cn } from '@/lib/utils'

function taskBarColor(kind: TaskKind, status: TaskStatus) {
  if (status === 'failed') return 'bg-mesh-danger'
  if (kind === 'install' || kind === 'download' || kind === 'import') return 'bg-mesh-accent'
  if (kind === 'sync' || kind === 'unsync') return 'bg-mesh-success'
  if (kind === 'update') return 'bg-mesh-warning'
  return 'bg-mesh-dim'
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: '等待中',
  running: '进行中',
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
}

export function DashboardPage() {
  const skills = useAppStore((s) => s.skills)
  const agents = useAppStore((s) => s.agents)
  const sources = useAppStore((s) => s.sources)
  const tasks = useAppStore((s) => s.tasks)
  const openSkill = useAppStore((s) => s.openSkill)
  const goDiscoverUpdates = useAppStore((s) => s.goDiscoverUpdates)
  const latestSkills = useAppStore(useShallow((s) => selectLatestDiscoverSkills(s, 3)))

  const mineCount = skills.filter((s) => s.installed || s.origin === 'created' || s.origin === 'imported').length
  const connectedAgents = agents.filter((a) => a.installed).length
  const updatable = skills.filter((s) => s.updateAvailable).length
  const today = new Date().toDateString()
  const todayTasks = tasks.filter((t) => new Date(t.createdAt).toDateString() === today).length
  const failedTasks = tasks.filter((t) => t.status === 'failed')
  const hubSources = sources.filter((s) => s.id !== 'local')
  const connectedSources = hubSources.filter((s) => s.enabled && s.status === 'connected').length

  const unsyncedInstalled = skills.filter(
    (s) => (s.installed || s.origin === 'created' || s.origin === 'imported') && s.syncedAgents.length === 0,
  )

  const installedAgents = agents.filter((a) => a.installed)
  const syncCoverage = installedAgents.length
    ? Math.round(
        (installedAgents.filter((a) => skills.some((s) => s.syncedAgents.includes(a.id))).length /
          installedAgents.length) *
          100,
      )
    : 0
  const unsyncedSkillCount = unsyncedInstalled.length

  const recentTasks = tasks.slice(0, 8)
  const lastCatalogSyncedAt = useAppStore((s) => s.lastCatalogSyncedAt)
  const neverSynced = !lastCatalogSyncedAt

  return (
    <div className="dash-root mx-auto flex max-w-[1280px] flex-col gap-3">
      {neverSynced ? (
        <div className="rounded-mesh border border-mesh-accent/35 bg-mesh-accentSoft/40 px-4 py-3 text-sm">
          <div className="font-medium text-mesh-text">首次启动需手动刷新列表</div>
          <p className="mt-1 text-xs text-mesh-dim">
            首次使用不会自动拉取技能。请前往
            <Link to="/skills/discover" className="mx-1 text-mesh-accent hover:underline">
              发现
            </Link>
            或
            <Link to="/settings/sources" className="mx-1 text-mesh-accent hover:underline">
              技能源配置
            </Link>
            ，点击「刷新列表」完成首次同步。
          </p>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="我的 Skill" value={mineCount} to="/skills/mine" tone="accent" />
        <KpiTile label="已连接智能体" value={connectedAgents} to="/settings/agents" tone="success" />
        <KpiTile
          label="可更新"
          value={updatable}
          to="/skills/discover"
          tone={updatable > 0 ? 'warning' : 'accent'}
          onNavigate={goDiscoverUpdates}
        />
        <KpiTile
          label="今日任务"
          value={todayTasks}
          to="/tasks"
          tone={failedTasks.length ? 'danger' : 'accent'}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <DashPanel
          title="发现 · 最新"
          action={
            <Link to="/skills/discover" className="text-mesh-accent hover:underline">
              去发现
            </Link>
          }
          bodyClassName="space-y-2"
        >
          {latestSkills.length ? (
            latestSkills.map((skill) => (
              <button
                key={skill.uid}
                type="button"
                onClick={() => openSkill(skill.uid)}
                className="flex w-full items-start gap-2.5 rounded border border-mesh-border bg-mesh-panel px-2.5 py-2 text-left transition-colors hover:border-mesh-borderBright hover:bg-mesh-cardHover"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-mesh-accentSoft text-xs font-semibold text-mesh-accent">
                  {skill.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{skill.name}</div>
                  <div className="mt-0.5 truncate text-[10px] text-mesh-dim">
                    {skill.sourceName} · v{skill.version}
                    {skill.updatedAt ? ` · ${skill.updatedAt}` : ''}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-mesh-muted">{skill.description}</p>
                </div>
              </button>
            ))
          ) : (
            <div className="space-y-3 py-6 text-center">
              <div className="text-xs text-mesh-dim">暂无发现数据，先同步技能源</div>
              <Link
                to="/settings/sources"
                className="inline-flex rounded-md bg-mesh-accent px-2.5 py-1 text-[11px] text-white"
              >
                去技能源配置
              </Link>
            </div>
          )}
        </DashPanel>

        <DashPanel
          title="智能体"
          action={
            <Link to="/settings/agents" className="text-mesh-accent hover:underline">
              管理
            </Link>
          }
        >
          <AgentMatrix agents={agents} skills={skills} />
        </DashPanel>

        <DashPanel
          title="技能平台"
          action={
            <Link to="/settings/sources" className="text-mesh-accent hover:underline">
              {connectedSources}/{hubSources.length}
            </Link>
          }
        >
          <SourceMatrix sources={sources} skills={skills} />
        </DashPanel>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <DashPanel
          title="任务时间线"
          action={
            <Link to="/tasks" className="text-mesh-accent hover:underline">
              全部
            </Link>
          }
          bodyClassName="space-y-1"
        >
          {recentTasks.length ? (
            recentTasks.map((task) => (
              <Link
                key={task.id}
                to="/tasks"
                className="flex items-center gap-2 rounded border border-transparent px-1.5 py-1.5 hover:border-mesh-border hover:bg-mesh-panel"
              >
                <span className={cn('h-8 w-0.5 shrink-0 rounded-full', taskBarColor(task.kind, task.status))} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-mesh-text">{task.title}</div>
                  <div className="truncate text-[10px] text-mesh-dim">
                    {task.kindLabel || task.subtitle || task.kind}
                    {' · '}
                    {new Date(task.createdAt).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <span
                  className={cn(
                    'shrink-0 text-[10px]',
                    task.status === 'failed'
                      ? 'text-mesh-danger'
                      : task.status === 'success'
                        ? 'text-mesh-success'
                        : task.status === 'running'
                          ? 'text-mesh-warning'
                          : 'text-mesh-dim',
                  )}
                >
                  {STATUS_LABEL[task.status] || task.status}
                </span>
              </Link>
            ))
          ) : (
            <div className="space-y-3 py-8 text-center">
              <div className="text-xs text-mesh-dim">暂无任务记录，去发现开始安装吧</div>
              <Link
                to="/skills/discover"
                className="inline-flex rounded-md bg-mesh-accent px-2.5 py-1 text-[11px] text-white"
              >
                去发现
              </Link>
            </div>
          )}
        </DashPanel>

        <DashPanel title="同步覆盖" bodyClassName="flex flex-col justify-center gap-4">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
              <span className="text-mesh-dim">已同步智能体占比</span>
              <span className="font-mono text-sm text-mesh-text">{syncCoverage}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-mesh-panel ring-1 ring-mesh-border">
              <div
                className="h-full rounded-full bg-mesh-success transition-all"
                style={{ width: `${syncCoverage}%` }}
              />
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
              <span className="text-mesh-dim">未同步 Skill</span>
              <span className={cn('font-mono text-sm', unsyncedSkillCount ? 'text-mesh-warning' : 'text-mesh-success')}>
                {unsyncedSkillCount}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-mesh-panel ring-1 ring-mesh-border">
              <div
                className="h-full rounded-full bg-mesh-warning transition-all"
                style={{
                  width: `${mineCount ? Math.min(100, Math.round((unsyncedSkillCount / mineCount) * 100)) : 0}%`,
                }}
              />
            </div>
          </div>
          <p className="text-[10px] leading-4 text-mesh-dim">
            {connectedAgents} 个智能体在线 · {mineCount} 个本地 Skill
          </p>
        </DashPanel>
      </div>
    </div>
  )
}
