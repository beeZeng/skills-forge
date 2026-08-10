import { Copy, Eye, ExternalLink, FolderOpen, Loader2, RefreshCw, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAppStore } from '@/stores/app-store'
import { cn, formatRelative } from '@/lib/utils'
import { SkillMarkdownPreviewModal } from '@/components/skill/SkillMarkdownPreviewModal'

function AgentSyncRow({
  skillUid,
  agentId,
  agentName,
  agentPath,
  installed,
  synced,
  onToggle,
  onResync,
}: {
  skillUid: string
  agentId: string
  agentName: string
  agentPath?: string
  installed: boolean
  synced: boolean
  onToggle: () => void
  onResync: () => void
}) {
  const busy = useAppStore((s) =>
    s.tasks.some(
      (t) =>
        t.skillUid === skillUid
        && t.agentId === agentId
        && (t.kind === 'sync' || t.kind === 'unsync')
        && (t.status === 'running' || t.status === 'pending'),
    ),
  )

  return (
    <div className="flex items-center justify-between gap-2 rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm">{agentName}</div>
        <div className="truncate text-[11px] text-mesh-dim">
          {busy ? '同步任务进行中...' : installed ? agentPath || '已发现' : '未发现'}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-mesh-accent" /> : null}
        {synced && installed ? (
          <button
            type="button"
            disabled={busy}
            onClick={onResync}
            title="重新同步到该智能体"
            className="inline-flex items-center gap-1 rounded-md border border-mesh-border px-1.5 py-1 text-[11px] text-mesh-muted hover:bg-mesh-panel hover:text-mesh-text disabled:opacity-40"
          >
            <RefreshCw className="h-3 w-3" />
            同步
          </button>
        ) : null}
        <button
          type="button"
          disabled={!installed || busy}
          onClick={onToggle}
          title={busy ? '同步任务进行中，请稍候' : undefined}
          className={cn(
            'relative h-6 w-11 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            synced ? 'bg-mesh-accent' : 'bg-mesh-border',
          )}
          aria-label={`同步到 ${agentName}`}
        >
          <span
            className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all',
              synced ? 'left-5' : 'left-0.5',
            )}
          />
        </button>
      </div>
    </div>
  )
}

export function SkillDrawer() {
  const location = useLocation()
  const open = useAppStore((s) => s.drawerOpen)
  const skill = useAppStore((s) => s.skills.find((item) => item.uid === s.selectedSkillUid) || null)
  const agents = useAppStore((s) => s.agents)
  const closeDrawer = useAppStore((s) => s.closeDrawer)
  const installSkill = useAppStore((s) => s.installSkill)
  const updateSkill = useAppStore((s) => s.updateSkill)
  const deleteSkill = useAppStore((s) => s.deleteSkill)
  const toggleAgentSync = useAppStore((s) => s.toggleAgentSync)
  const resyncSkill = useAppStore((s) => s.resyncSkill)
  const openSkillDirectory = useAppStore((s) => s.openSkillDirectory)
  const [previewOpen, setPreviewOpen] = useState(false)

  // 切换页面时自动关闭，避免详情残留在其他路由上
  useEffect(() => {
    closeDrawer()
    setPreviewOpen(false)
  }, [location.pathname, closeDrawer])

  useEffect(() => {
    if (!open) setPreviewOpen(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !previewOpen) closeDrawer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeDrawer, previewOpen])

  if (!open || !skill) return null

  const hasSync = skill.syncedAgents.length > 0

  return (
    <>
    <div className="fixed inset-0 z-[160] flex justify-end">
      <button
        type="button"
        aria-label="关闭详情"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px] transition-opacity"
        onClick={closeDrawer}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${skill.name} 详情`}
        className="skill-drawer-panel relative flex h-full w-full max-w-[420px] flex-col border-l border-mesh-border bg-mesh-panel shadow-mesh"
      >
        <div className="flex items-start gap-3 border-b border-mesh-border p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-mesh bg-mesh-accentSoft text-lg font-semibold text-mesh-accent">
            {skill.name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{skill.name}</h2>
            <div className="text-xs text-mesh-dim">
              {skill.sourceName}
              {skill.namespace ? ` · ${skill.namespace}/${skill.skillId}` : ''}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span className="font-mono text-mesh-muted">v{skill.version}</span>
              <span
                className={cn(
                  skill.updateAvailable ? 'text-mesh-warning' : skill.installed ? 'text-mesh-success' : 'text-mesh-muted',
                )}
              >
                {!skill.installed ? '未安装' : skill.updateAvailable ? '有更新' : '✓ 已安装 · 最新'}
              </span>
            </div>
          </div>
          <button type="button" onClick={closeDrawer} className="rounded-md p-1.5 text-mesh-dim hover:bg-mesh-card hover:text-mesh-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm">
          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-mesh-dim">简介</div>
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-mesh-border px-2 py-0.5 text-[11px] text-mesh-muted hover:bg-mesh-card hover:text-mesh-text"
              >
                <Eye className="h-3 w-3" />
                预览文档
              </button>
            </div>
            <p className="leading-6 text-mesh-muted">{skill.description}</p>
          </section>

          <section>
            <div className="mb-1.5 text-xs font-medium text-mesh-dim">标签</div>
            <div className="flex flex-wrap gap-1.5">
              {skill.tags.map((tag) => (
                <span key={tag} className="rounded-md bg-mesh-card px-2 py-1 text-xs text-mesh-muted">
                  {tag}
                </span>
              ))}
            </div>
          </section>

          <section className="space-y-2 rounded-mesh border border-mesh-border bg-mesh-card p-3">
            <div className="text-xs font-medium text-mesh-dim">详情</div>
            {[
              ['作者', skill.author || '-'],
              ['来源', skill.sourceName],
              ['大小', skill.sizeLabel || '-'],
              ['本地路径', skill.localPath || '-'],
              ['更新时间', skill.updatedAt || '-'],
              ['许可证', skill.license || '-'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 text-xs">
                <span className="text-mesh-dim">{k}</span>
                <span className="max-w-[220px] truncate text-right text-mesh-text" title={String(v)}>
                  {v}
                </span>
              </div>
            ))}
            {skill.homepageUrl ? (
              <div className="space-y-1.5 border-t border-mesh-border pt-2">
                <div className="text-xs text-mesh-dim">原始地址</div>
                <div className="break-all font-mono text-[11px] text-mesh-muted" title={skill.homepageUrl}>
                  {skill.homepageUrl}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-mesh-border px-2 py-0.5 text-[11px] text-mesh-muted hover:bg-mesh-panel hover:text-mesh-text"
                    onClick={() => {
                      void (async () => {
                        try {
                          await navigator.clipboard.writeText(skill.homepageUrl!)
                          useAppStore.getState().showToast('已复制原始地址', 'success')
                        } catch {
                          useAppStore.getState().showToast('复制失败', 'error')
                        }
                      })()
                    }}
                  >
                    <Copy className="h-3 w-3" />
                    复制
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-mesh-border px-2 py-0.5 text-[11px] text-mesh-muted hover:bg-mesh-panel hover:text-mesh-text"
                    onClick={() => {
                      void (async () => {
                        const api = window.skillMesh?.shell?.openExternal
                        if (api) {
                          const result = await api(skill.homepageUrl!)
                          if (!result.ok) {
                            useAppStore.getState().showToast(result.error || '打开失败', 'error')
                          }
                          return
                        }
                        window.open(skill.homepageUrl, '_blank', 'noopener,noreferrer')
                      })()
                    }}
                  >
                    <ExternalLink className="h-3 w-3" />
                    浏览器打开
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-1 text-[11px] text-mesh-dim">暂无原始地址</div>
            )}
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-mesh-accent hover:underline"
            >
              <Eye className="h-3 w-3" />
              预览 SKILL.md
            </button>
          </section>

          {skill.installed ? (
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-mesh-dim">同步到智能体</div>
                {hasSync ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-mesh-border px-2 py-0.5 text-[11px] text-mesh-muted hover:bg-mesh-card hover:text-mesh-text"
                    onClick={() => resyncSkill(skill.uid)}
                    title="将本地 Skill 重新写入所有已同步智能体"
                  >
                    <RefreshCw className="h-3 w-3" />
                    全部重新同步
                  </button>
                ) : null}
              </div>
              <div className="space-y-2">
                {agents.map((agent) => (
                  <AgentSyncRow
                    key={agent.id}
                    skillUid={skill.uid}
                    agentId={agent.id}
                    agentName={agent.name}
                    agentPath={agent.installed ? agent.skillPath : undefined}
                    installed={agent.installed}
                    synced={skill.syncedAgents.includes(agent.id)}
                    onToggle={() => toggleAgentSync(skill.uid, agent.id)}
                    onResync={() => resyncSkill(skill.uid, agent.id)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {skill.updateAvailable ? (
            <section className="rounded-mesh border border-mesh-warning/30 bg-mesh-warning/10 p-3 text-xs">
              <div>当前版本 v{skill.version}</div>
              <div className="mt-1 text-mesh-warning">最新版本 v{skill.latestVersion}</div>
            </section>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-mesh-border p-4">
          <div className="flex items-center gap-2">
            {skill.installed ? (
              <>
                <button
                  type="button"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2 text-sm hover:bg-mesh-cardHover"
                  onClick={() => void openSkillDirectory(skill.uid)}
                >
                  <FolderOpen className="h-4 w-4" /> 打开本地目录
                </button>
                <button
                  type="button"
                  disabled={hasSync}
                  title={hasSync ? '请先取消所有智能体同步后再删除' : '删除本地 Skill'}
                  className={cn(
                    'rounded-mesh border p-2',
                    hasSync
                      ? 'cursor-not-allowed border-mesh-border bg-mesh-panel text-mesh-dim opacity-50'
                      : 'border-mesh-danger/40 bg-mesh-danger/10 text-mesh-danger hover:bg-mesh-danger/20',
                  )}
                  onClick={() => {
                    if (hasSync) return
                    void deleteSkill(skill.uid)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="flex-1 rounded-mesh bg-mesh-accent px-3 py-2 text-sm font-medium text-white hover:bg-mesh-accent/90"
                onClick={() => installSkill(skill.uid)}
              >
                安装
              </button>
            )}
            {skill.updateAvailable ? (
              <button
                type="button"
                className="flex-1 rounded-mesh bg-mesh-warning px-3 py-2 text-sm font-medium text-black hover:bg-mesh-warning/90"
                onClick={() => updateSkill(skill.uid)}
              >
                更新
              </button>
            ) : null}
          </div>
          {hasSync ? (
            <div className="text-[11px] text-mesh-warning">该 Skill 已同步到智能体，删除前请先取消同步</div>
          ) : null}
          <div className="text-[11px] text-mesh-dim">
            {!skill.installed
              ? '○ 尚未安装到本地'
              : skill.updateAvailable
                ? '● 检测到新版本'
                : skill.syncedAgents.length
                  ? '● 已安装并已同步到智能体'
                  : '● 已安装，尚未同步到智能体'}
            <div className="mt-0.5">
              上次同步：
              {skill.lastSyncedAt
                ? formatRelative(skill.lastSyncedAt)
                : skill.syncedAgents.length
                  ? '已同步（时间未知）'
                  : '尚未同步'}
            </div>
          </div>
        </div>
      </aside>
    </div>
    <SkillMarkdownPreviewModal
      skill={skill}
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
    />
    </>
  )
}
