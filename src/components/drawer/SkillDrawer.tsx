import { ChevronDown, ChevronRight, Copy, Eye, ExternalLink, FolderOpen, Loader2, RefreshCw, Star, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAppStore } from '@/stores/app-store'
import { cn, formatCount, formatRelative, skillInstalls } from '@/lib/utils'
import { PathReveal } from '@/components/common/PathReveal'
import { SkillMarkdownPreviewModal } from '@/components/skill/SkillMarkdownPreviewModal'
import { applyStatsToSkill, recordSkillView, statsMetaFromSkill } from '@/services/skill-analytics'
import type { SkillBadge, SkillPackageFileNode } from '@/types'

const BADGE_LABEL: Record<SkillBadge, string> = {
  new: '新发布',
  editor: '编辑推荐',
  fast_growth: '快速增长',
  hot: '热门',
}

function FileTreeNodes({ nodes, depth = 0 }: { nodes: SkillPackageFileNode[]; depth?: number }) {
  if (!nodes?.length) return null
  return (
    <ul className={cn('space-y-0.5', depth === 0 ? '' : 'ml-3 border-l border-mesh-border pl-2')}>
      {nodes.map((node) => (
        <li key={node.path}>
          <div className="flex items-center gap-1 font-mono text-[11px] text-mesh-muted">
            {node.type === 'dir' ? (
              <ChevronRight className="h-3 w-3 shrink-0 text-mesh-dim" />
            ) : (
              <span className="inline-block w-3 shrink-0" />
            )}
            <span className={node.type === 'dir' ? 'text-mesh-text' : ''}>{node.name}</span>
          </div>
          {node.type === 'dir' && node.children?.length ? (
            <FileTreeNodes nodes={node.children} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  )
}

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
        {busy ? (
          <div className="truncate text-[11px] text-mesh-dim">同步任务进行中...</div>
        ) : installed ? (
          <PathReveal label="技能目录" path={agentPath} compact className="mt-0.5" />
        ) : (
          <div className="truncate text-[11px] text-mesh-dim">未发现</div>
        )}
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
  const toggleFavorite = useAppStore((s) => s.toggleFavorite)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [readme, setReadme] = useState('')
  const [fileTree, setFileTree] = useState<SkillPackageFileNode[]>([])
  const [metaLoading, setMetaLoading] = useState(false)
  const [metaError, setMetaError] = useState('')
  const [syncHintVisible, setSyncHintVisible] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const syncSectionRef = useRef<HTMLElement>(null)

  // 切换页面时自动关闭，避免详情残留在其他路由上
  useEffect(() => {
    closeDrawer()
    setPreviewOpen(false)
  }, [location.pathname, closeDrawer])

  useEffect(() => {
    if (!open) setPreviewOpen(false)
  }, [open])

  // Show bounce hint when installed but sync block is below the fold.
  useEffect(() => {
    if (!open || !skill?.installed) {
      setSyncHintVisible(false)
      return
    }
    const root = scrollRef.current
    const target = syncSectionRef.current
    if (!root || !target) {
      setSyncHintVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setSyncHintVisible(!entry?.isIntersecting)
      },
      { root, threshold: 0.18, rootMargin: '0px 0px -24px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [open, skill?.installed, skill?.uid, agents.length])

  const scrollToSync = () => {
    const root = scrollRef.current
    const target = syncSectionRef.current
    if (!root || !target) return
    const top = Math.max(0, target.offsetTop - 16)
    root.scrollTo({ top, behavior: 'smooth' })
  }

  // View count: dwell ≥ 3s on detail drawer, 24h dedupe handled in main process.
  useEffect(() => {
    if (!open || !skill) return
    const skillUid = skill.uid
    const timer = window.setTimeout(() => {
      const state = useAppStore.getState()
      if (!state.drawerOpen || state.selectedSkillUid !== skillUid) return
      const current = state.skills.find((item) => item.uid === skillUid)
      if (!current) return
      void (async () => {
        const result = await recordSkillView(statsMetaFromSkill(current, state.account.userId))
        if (!result?.ok || !result.counted) return
        useAppStore.setState((s) => ({
          skills: s.skills.map((item) =>
            item.uid === skillUid ? applyStatsToSkill(item, result) : item,
          ),
        }))
      })().catch(() => undefined)
    }, 3000)
    return () => window.clearTimeout(timer)
  }, [open, skill?.uid])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !previewOpen) closeDrawer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeDrawer, previewOpen])

  useEffect(() => {
    if (!open || !skill) {
      setReadme('')
      setFileTree([])
      setMetaError('')
      return
    }
    if (!skill.installed && !skill.localPath && !skill.agentInstallPath) {
      setReadme('')
      setFileTree([])
      setMetaError('')
      return
    }

    let cancelled = false
    setMetaLoading(true)
    setMetaError('')
    void (async () => {
      try {
        const api = window.skillMesh?.skills?.readPackageMeta
        if (!api) {
          if (!cancelled) {
            setReadme('')
            setFileTree([])
            setMetaError('当前环境不支持读取包元数据')
          }
          return
        }
        const res = await api({
          localPath: skill.localPath,
          agentInstallPath: skill.agentInstallPath,
          name: skill.manifest?.name || skill.name,
        })
        if (cancelled) return
        if (!res.ok) {
          setReadme('')
          setFileTree([])
          setMetaError(res.error || '无法读取包内容')
          return
        }
        setReadme(res.readme || '')
        setFileTree(res.fileTree || [])
        if (res.manifest) {
          useAppStore.setState((s) => ({
            skills: s.skills.map((item) =>
              item.uid === skill.uid
                ? {
                    ...item,
                    manifest: res.manifest || item.manifest,
                    author: res.manifest?.author || item.author,
                    description: res.manifest?.description || item.description,
                    agentInstallPath: res.path || item.agentInstallPath,
                  }
                : item,
            ),
          }))
        }
      } catch (error) {
        if (!cancelled) {
          setMetaError(error instanceof Error ? error.message : '读取包内容失败')
        }
      } finally {
        if (!cancelled) setMetaLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    open,
    skill?.uid,
    skill?.installed,
    skill?.localPath,
    skill?.agentInstallPath,
    skill?.version,
  ])

  if (!open || !skill) return null

  const hasSync = skill.syncedAgents.length > 0
  const displayAuthor = skill.manifest?.author || skill.author || '-'
  const displayVersion = skill.manifest?.version || skill.version
  const displayDescription = skill.manifest?.description || skill.description

  return (
    <>
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="关闭详情"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity"
        onClick={closeDrawer}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${skill.name} 详情`}
        className="skill-detail-modal relative z-10 flex h-[min(880px,92vh)] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-mesh-border bg-mesh-panel shadow-mesh"
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-mesh-border p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-mesh bg-mesh-accentSoft text-lg font-semibold text-mesh-accent">
            {skill.name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{skill.name}</h2>
              <button
                type="button"
                className="rounded-md p-1 text-mesh-dim hover:text-mesh-warning"
                onClick={() => toggleFavorite(skill.uid)}
                aria-label="收藏"
              >
                <Star className={cn('h-4 w-4', skill.favorite && 'fill-mesh-warning text-mesh-warning')} />
              </button>
            </div>
            <div className="text-xs text-mesh-dim">
              {skill.sourceName}
              {skill.namespace ? ` · ${skill.namespace}/${skill.skillId}` : ''}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span className="font-mono text-mesh-muted">v{displayVersion}</span>
              <span
                className={cn(
                  skill.updateAvailable ? 'text-mesh-warning' : skill.installed ? 'text-mesh-success' : 'text-mesh-muted',
                )}
              >
                {!skill.installed ? '未安装' : skill.updateAvailable ? '有更新' : '✓ 已安装 · 最新'}
              </span>
            </div>
            {skill.badges?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {skill.badges.slice(0, 3).map((badge) => (
                  <span key={badge} className="rounded-md bg-mesh-bg px-1.5 py-0.5 text-[10px] text-mesh-muted">
                    {BADGE_LABEL[badge]}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <button type="button" onClick={closeDrawer} className="rounded-md p-1.5 text-mesh-dim hover:bg-mesh-card hover:text-mesh-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            ref={scrollRef}
            className="h-full space-y-5 overflow-y-auto overscroll-contain p-4 text-sm"
          >
          <section className="grid grid-cols-4 gap-2 rounded-mesh border border-mesh-border bg-mesh-card p-3">
            {[
              ['浏览', formatCount(skill.viewCount ?? 0)],
              ['收藏', formatCount(skill.favoriteCount ?? (skill.favorite ? 1 : 0))],
              ['安装', formatCount(skillInstalls(skill))],
              ['版本', `v${displayVersion}`],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 text-center">
                <div className="truncate text-sm font-semibold text-mesh-text">{value}</div>
                <div className="mt-0.5 text-[11px] text-mesh-dim">{label}</div>
              </div>
            ))}
          </section>

          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-mesh-dim">描述</div>
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-mesh-border px-2 py-0.5 text-[11px] text-mesh-muted hover:bg-mesh-card hover:text-mesh-text"
              >
                <Eye className="h-3 w-3" />
                预览 skill.md
              </button>
            </div>
            <p className="leading-6 text-mesh-muted">{displayDescription}</p>
          </section>

          <section>
            <div className="mb-1.5 text-xs font-medium text-mesh-dim">标签</div>
            <div className="flex flex-wrap gap-1.5">
              {(skill.manifest?.tags?.length ? skill.manifest.tags : skill.tags).map((tag) => (
                <span key={tag} className="rounded-md bg-mesh-card px-2 py-1 text-xs text-mesh-muted">
                  {tag}
                </span>
              ))}
            </div>
          </section>

          <section className="space-y-2 rounded-mesh border border-mesh-border bg-mesh-card p-3">
            <div className="text-xs font-medium text-mesh-dim">详情</div>
            {[
              ['名称', skill.manifest?.name || skill.name],
              ['skill_id', skill.manifest?.skill_id || '-'],
              ['版本', `v${displayVersion}`],
              ['作者', displayAuthor],
              ['来源', skill.manifest?.source || skill.sourceId || skill.sourceName],
              ['来源显示名', skill.sourceName],
              ['大小', skill.sizeLabel || '-'],
              ['更新时间', skill.updatedAt || '-'],
              ['许可证', skill.license || skill.manifest?.license || '-'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 text-xs">
                <span className="text-mesh-dim">{k}</span>
                <span className="max-w-[220px] truncate text-right text-mesh-text" title={String(v)}>
                  {v}
                </span>
              </div>
            ))}
            <PathReveal label="本地技能目录" path={skill.localPath} className="pt-1" />
            <PathReveal label="智能体技能目录" path={skill.agentInstallPath} />
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
          </section>

          <section>
            <div className="mb-1.5 text-xs font-medium text-mesh-dim">README</div>
            {metaLoading ? (
              <div className="flex items-center gap-2 text-xs text-mesh-dim">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在解析包内容…
              </div>
            ) : metaError ? (
              <div className="text-xs text-mesh-dim">{metaError}</div>
            ) : readme ? (
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-mesh border border-mesh-border bg-mesh-card p-3 text-[12px] leading-5 text-mesh-muted">
                {readme}
              </pre>
            ) : skill.installed ? (
              <div className="text-xs text-mesh-dim">未找到 README.md</div>
            ) : (
              <div className="text-xs text-mesh-dim">安装后将解析 README.md（不直接展示 zip）</div>
            )}
          </section>

          <section>
            <div className="mb-1.5 text-xs font-medium text-mesh-dim">文件结构</div>
            {metaLoading ? (
              <div className="flex items-center gap-2 text-xs text-mesh-dim">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在读取目录树…
              </div>
            ) : fileTree.length ? (
              <div className="max-h-48 overflow-auto rounded-mesh border border-mesh-border bg-mesh-card p-3">
                <FileTreeNodes nodes={fileTree} />
              </div>
            ) : skill.installed ? (
              <div className="text-xs text-mesh-dim">暂无文件树</div>
            ) : (
              <div className="text-xs text-mesh-dim">安装后展示标准包结构</div>
            )}
          </section>

          {skill.installed ? (
            <section
              ref={syncSectionRef}
              id="skill-sync-agents"
              className="scroll-mt-3 rounded-xl border border-mesh-accent/35 bg-mesh-accentSoft/40 p-3 ring-1 ring-mesh-accent/20"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-mesh-accent">同步到智能体</div>
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
                ) : (
                  <span className="text-[11px] text-mesh-accent/80">安装完成 · 可同步到本机 Agent</span>
                )}
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
          {/* bottom spacer so last section isn't hidden behind the sync hint */}
          {skill.installed ? <div className="h-10 shrink-0" aria-hidden /> : null}
          </div>

          {skill.installed && syncHintVisible ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-4">
              <button
                type="button"
                onClick={scrollToSync}
                className="pointer-events-auto skill-sync-hint inline-flex items-center gap-1.5 rounded-full border border-mesh-accent/40 bg-mesh-accent px-3.5 py-2 text-xs font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.35)]"
              >
                <ChevronDown className="skill-sync-hint-arrow h-4 w-4" />
                向下同步智能体
              </button>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 space-y-3 border-t border-mesh-border bg-mesh-panel p-4">
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
                className="relative z-10 flex-1 rounded-mesh bg-mesh-accent px-3 py-2 text-sm font-medium text-white hover:bg-mesh-accent/90"
                onClick={(e) => {
                  e.stopPropagation()
                  installSkill(skill.uid)
                }}
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
