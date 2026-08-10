import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Download,
  Package,
  Radar,
  RefreshCw,
  ScanSearch,
  X,
} from 'lucide-react'
import { BrandMark } from '@/components/brand/BrandMark'
import { AgentLogo } from '@/components/hub/AgentLogo'
import { PathReveal } from '@/components/common/PathReveal'
import { useAppStore } from '@/stores/app-store'
import { cn, formatRelative } from '@/lib/utils'
import type { AgentInstallation, Skill, TaskItem } from '@/types'

const AGENT_ORDER = ['cursor', 'claude-code', 'codex', 'trae', 'qoder', 'piagent', 'opencode'] as const

type AgentNodeStatus = 'live' | 'off' | 'error' | 'scanning'

function resolveStatus(
  agent: AgentInstallation,
  skills: Skill[],
  tasks: TaskItem[],
): AgentNodeStatus {
  const busy = tasks.some(
    (t) =>
      t.agentId === agent.id &&
      (t.status === 'running' || t.status === 'pending') &&
      (t.kind === 'sync' || t.kind === 'unsync' || t.kind === 'install' || t.kind === 'update'),
  )
  if (busy) return 'scanning'
  if (!agent.installed) return 'off'
  const synced = skills.filter((s) => s.syncedAgents.includes(agent.id))
  const abnormal = synced.some(
    (s) =>
      s.installed &&
      ((s.origin !== 'created' && s.origin !== 'imported' && !s.localPath && !s.agentInstallPath) ||
        !s.agentInstallPath),
  )
  return abnormal ? 'error' : 'live'
}

function ringPosition(index: number, total: number) {
  const angle = (-90 + (360 / Math.max(total, 1)) * index) * (Math.PI / 180)
  // Keep nodes inward so top (Cursor) orb isn't clipped by stage overflow
  const radiusX = 32
  const radiusY = 30
  return {
    left: `${50 + radiusX * Math.cos(angle)}%`,
    top: `${50 + radiusY * Math.sin(angle)}%`,
  }
}

function statusLabel(status: AgentNodeStatus) {
  if (status === 'live') return '已连接'
  if (status === 'scanning') return '扫描中'
  if (status === 'error') return '异常'
  return '未发现'
}

type ActivityKind = 'install' | 'sync' | 'update' | 'detect' | 'scan'

type ActivityItem = {
  id: string
  title: string
  time?: string
  tone: 'ok' | 'warn' | 'info'
  kind: ActivityKind
}

function ActivityIcon({ kind }: { kind: ActivityKind }) {
  const cls = 'h-3.5 w-3.5 shrink-0'
  if (kind === 'install') return <Download className={cls} />
  if (kind === 'sync') return <RefreshCw className={cls} />
  if (kind === 'update') return <ArrowUpRight className={cls} />
  if (kind === 'scan') return <Radar className={cls} />
  return <ScanSearch className={cls} />
}

/** AI Agent Network status view — Nexus Core + orbital agent nodes. */
export function AgentStatusCenter() {
  const navigate = useNavigate()
  const agents = useAppStore((s) => s.agents)
  const skills = useAppStore((s) => s.skills)
  const tasks = useAppStore((s) => s.tasks)
  const lastCatalogSyncedAt = useAppStore((s) => s.lastCatalogSyncedAt)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])

  const overview = useMemo(() => {
    const installed = skills.filter((s) => s.installed)
    const updatable = installed.filter((s) => s.updateAvailable).length
    const synced = installed.filter((s) => s.syncedAgents.length > 0).length
    const unsynced = installed.length - synced
    const abnormal = installed.filter(
      (s) =>
        !s.updateAvailable &&
        ((s.origin !== 'created' && s.origin !== 'imported' && !s.localPath && !s.agentInstallPath) ||
          (s.syncedAgents.length > 0 && !s.agentInstallPath)),
    ).length
    const available = agents.filter((a) => a.installed).length
    return {
      skillCount: installed.length,
      synced,
      unsynced,
      updatable,
      abnormal,
      available,
      syncRate: installed.length ? Math.round((synced / installed.length) * 100) : 0,
    }
  }, [skills, agents])

  const ringAgents = useMemo(() => {
    const byId = new Map(agents.map((a) => [a.id, a]))
    const ordered: AgentInstallation[] = []
    for (const id of AGENT_ORDER) {
      const hit = byId.get(id)
      if (hit) {
        ordered.push(hit)
        byId.delete(id)
      }
    }
    for (const rest of byId.values()) ordered.push(rest)
    return ordered
  }, [agents])

  const selected = ringAgents.find((a) => a.id === selectedId) || null
  const selectedStatus = selected ? resolveStatus(selected, skills, tasks) : null
  const selectedSynced = selected
    ? skills.filter((s) => s.syncedAgents.includes(selected.id))
    : []

  const activities = useMemo(() => {
    const items: ActivityItem[] = []
    for (const task of tasks) {
      if (!['install', 'sync', 'unsync', 'update'].includes(task.kind)) continue
      const running = task.status === 'running' || task.status === 'pending'
      const verb =
        task.kind === 'install'
          ? running
            ? '正在安装'
            : '安装'
          : task.kind === 'update'
            ? running
              ? '正在更新'
              : '更新'
            : task.kind === 'sync'
              ? running
                ? '正在同步'
                : '同步'
              : running
                ? '正在取消同步'
                : '取消同步'
      items.push({
        id: task.id,
        title: `${verb} ${task.skillName || task.title}${task.agentName ? ` → ${task.agentName}` : ''}`,
        time: task.updatedAt || task.createdAt,
        tone: task.status === 'failed' ? 'warn' : task.status === 'success' ? 'ok' : 'info',
        kind:
          task.kind === 'install'
            ? 'install'
            : task.kind === 'update'
              ? 'update'
              : task.kind === 'sync' || task.kind === 'unsync'
                ? 'sync'
                : 'scan',
      })
    }
    for (const agent of agents) {
      if (!agent.lastDetectedAt) continue
      items.push({
        id: `detect-${agent.id}-${agent.lastDetectedAt}`,
        title: agent.installed ? `检测到 ${agent.name}` : `扫描 ${agent.name}（未发现）`,
        time: agent.lastDetectedAt,
        tone: agent.installed ? 'ok' : 'info',
        kind: 'detect',
      })
    }
    if (lastCatalogSyncedAt) {
      items.push({
        id: `catalog-sync-${lastCatalogSyncedAt}`,
        title: 'Skill 目录已同步',
        time: lastCatalogSyncedAt,
        tone: 'ok',
        kind: 'sync',
      })
    }
    // Soft network pulse when feed is sparse — keep the board alive
    const liveAgents = agents.filter((a) => a.installed)
    if (items.length < 4 && liveAgents.length) {
      for (const agent of liveAgents.slice(0, 4)) {
        items.push({
          id: `pulse-${agent.id}`,
          title: `${agent.name} 链路在线`,
          time: agent.lastDetectedAt || new Date().toISOString(),
          tone: 'info',
          kind: 'scan',
        })
      }
    }
    return items
      .sort((a, b) => (b.time || '').localeCompare(a.time || ''))
      .slice(0, 8)
  }, [tasks, agents, lastCatalogSyncedAt])

  return (
    <section className="hub-section hub-agent-network">
      <div className="hub-section-head">
        <div>
          <h2 className="hub-section-title">Agent 状态中心</h2>
          <p className="hub-section-sub">Nexus Core 与本机 Agent 连接拓扑</p>
        </div>
        <Link to="/settings/agents" className="hub-link">
          管理入口 →
        </Link>
      </div>

      <div className="agent-net-stage" aria-label="Agent Network">
        <div className="agent-net-orbit agent-net-orbit-a" />
        <div className="agent-net-orbit agent-net-orbit-b" />
        <div className="agent-net-scan-ring" aria-hidden />

        <svg className="agent-net-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {ringAgents.map((agent, i) => {
            const pos = ringPosition(i, ringAgents.length)
            const status = resolveStatus(agent, skills, tasks)
            return (
              <line
                key={agent.id}
                className={cn('agent-net-line', `is-${status}`)}
                x1="50"
                y1="50"
                x2={Number.parseFloat(pos.left)}
                y2={Number.parseFloat(pos.top)}
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            )
          })}
        </svg>

        <div className="agent-net-core" title="Nexus Core · 本地 Agent 管理中心">
          <span className="agent-net-core-glow" />
          <BrandMark className="h-10 w-10" title="Nexus" />
          <span className="agent-net-core-label">
            <span>Nexus</span>
            <strong>Core</strong>
          </span>
        </div>

        {ringAgents.map((agent, i) => {
          const status = resolveStatus(agent, skills, tasks)
          const synced = skills.filter((s) => s.syncedAgents.includes(agent.id)).length
          const pos = ringPosition(i, ringAgents.length)
          return (
            <button
              key={agent.id}
              type="button"
              className={cn('agent-net-node', `is-${status}`, selectedId === agent.id && 'is-selected')}
              style={{ left: pos.left, top: pos.top, animationDelay: `${i * 0.08}s` }}
              onClick={() => setSelectedId(agent.id)}
              title={`${agent.name} · ${statusLabel(status)}`}
            >
              <span className="agent-net-node-orb">
                <span className="agent-net-breath" />
                <span className="agent-net-scan" />
                <AgentLogo agentId={agent.id} className="agent-net-logo-mark" />
                <span className={cn('agent-net-status-dot', `is-${status}`)} />
              </span>
              <span className="agent-net-node-name">{agent.name}</span>
              <span className="agent-net-node-meta">
                {status === 'live' || status === 'error' || status === 'scanning'
                  ? `同步 ${synced}`
                  : statusLabel(status)}
              </span>
            </button>
          )
        })}
      </div>

      <div className="agent-cap-grid">
        <div className="agent-cap-card">
          <div className="agent-cap-icon">
            <Package className="h-4 w-4" />
          </div>
          <div className="agent-cap-body">
            <div className="agent-cap-title">Skill 数量</div>
            <div className="agent-cap-value">{overview.skillCount}</div>
            <div className="agent-cap-sub">本地已安装能力包</div>
          </div>
        </div>
        <div className="agent-cap-card">
          <div className="agent-cap-icon is-ok">
            <RefreshCw className="h-4 w-4" />
          </div>
          <div className="agent-cap-body">
            <div className="agent-cap-title">同步状态</div>
            <div className="agent-cap-value">
              {overview.synced}
              <span className="agent-cap-suffix">/ {overview.skillCount}</span>
            </div>
            <div className="agent-cap-sub">
              覆盖率 {overview.syncRate}%
              {overview.unsynced ? ` · ${overview.unsynced} 未同步` : ' · 全部已同步'}
            </div>
          </div>
        </div>
        <div className="agent-cap-card">
          <div className={cn('agent-cap-icon', overview.updatable ? 'is-warn' : 'is-ok')}>
            <ArrowUpRight className="h-4 w-4" />
          </div>
          <div className="agent-cap-body">
            <div className="agent-cap-title">更新状态</div>
            <div className={cn('agent-cap-value', overview.updatable && 'is-warn')}>
              {overview.updatable}
            </div>
            <div className="agent-cap-sub">
              {overview.updatable ? '有可更新 Skill' : '全部为最新版本'}
            </div>
          </div>
        </div>
        <div className="agent-cap-card">
          <div className={cn('agent-cap-icon', overview.abnormal ? 'is-danger' : 'is-ok')}>
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="agent-cap-body">
            <div className="agent-cap-title">健康状态</div>
            <div className={cn('agent-cap-value', overview.abnormal && 'is-danger')}>
              {overview.abnormal ? overview.abnormal : overview.available}
            </div>
            <div className="agent-cap-sub">
              {overview.abnormal
                ? `${overview.abnormal} 个异常`
                : `${overview.available} 个可用 Agent`}
            </div>
          </div>
        </div>
      </div>

      <div className="agent-activity">
        <div className="agent-activity-head">
          <Activity className="h-4 w-4" />
          <span>最近活动</span>
          <span className="agent-activity-count">{activities.length}</span>
        </div>
        {activities.length ? (
          <ul className="agent-activity-list">
            {activities.map((item) => (
              <li key={item.id} className={cn('agent-activity-item', `is-${item.tone}`)}>
                <span className={cn('agent-activity-icon', `is-${item.tone}`)}>
                  <ActivityIcon kind={item.kind} />
                </span>
                <div className="agent-activity-body">
                  <div className="agent-activity-title">{item.title}</div>
                  <div className="agent-activity-time">{formatRelative(item.time)}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="agent-activity-empty">
            <ScanSearch className="h-4 w-4" />
            暂无活动 · 安装或同步 Skill 后将显示在此
          </div>
        )}
      </div>

      {selected && selectedStatus ? (
        <div className="agent-detail-overlay" role="presentation" onClick={() => setSelectedId(null)}>
          <aside
            className="agent-detail-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.name} 详情`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="agent-detail-top">
              <div className="agent-detail-brand">
                <span className={cn('agent-detail-orb', `is-${selectedStatus}`)}>
                  <AgentLogo agentId={selected.id} className="agent-detail-logo" />
                  <span className={cn('agent-net-status-dot', `is-${selectedStatus}`)} />
                </span>
                <div>
                  <h3>{selected.name}</h3>
                  <p className={cn('agent-detail-status', `is-${selectedStatus}`)}>
                    {statusLabel(selectedStatus)}
                    {selected.version ? ` · v${selected.version}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="agent-detail-close"
                onClick={() => setSelectedId(null)}
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="agent-detail-stats">
              <div>
                <div className="value">{selectedSynced.length}</div>
                <div className="label">已同步 Skill</div>
              </div>
              <div>
                <div className="value">{selected.installed ? '在线' : '离线'}</div>
                <div className="label">检测结果</div>
              </div>
            </div>

            <div className="agent-detail-block">
              <div className="agent-detail-label">Skill 目录</div>
              <PathReveal label="技能目录" path={selected.skillPath} compact />
            </div>

            {selectedSynced.length ? (
              <div className="agent-detail-block">
                <div className="agent-detail-label">近期同步</div>
                <ul className="agent-detail-skills">
                  {selectedSynced.slice(0, 5).map((skill) => (
                    <li key={skill.uid}>{skill.name}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="agent-detail-actions">
              <button
                type="button"
                className="agent-detail-manage"
                onClick={() => {
                  setSelectedId(null)
                  navigate('/settings/agents')
                }}
              >
                进入智能体管理
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  )
}
