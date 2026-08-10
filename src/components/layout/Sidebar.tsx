import { NavLink } from 'react-router-dom'
import {
  BookOpen,
  Bot,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CloudUpload,
  Database,
  HardDrive,
  LayoutDashboard,
  Search,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react'
import { BrandMark } from '@/components/brand/BrandMark'
import { selectFailedTaskCount, selectRunningTaskCount, useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'

function Item({
  to,
  icon: Icon,
  label,
  badge,
  collapsed,
  onNavigate,
}: {
  to: string
  icon: LucideIcon
  label: string
  badge?: number
  collapsed?: boolean
  onNavigate?: () => void
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'app-no-drag group flex items-center rounded-xl font-medium tracking-tight transition-colors',
          collapsed ? 'h-10 w-10 justify-center px-0' : 'gap-2.5 px-2.5 py-2 text-[13.5px]',
          isActive
            ? 'bg-mesh-accentSoft text-mesh-accent'
            : 'text-mesh-muted hover:bg-mesh-cardHover hover:text-mesh-text',
        )
      }
      title={label}
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              'h-[17px] w-[17px] shrink-0',
              isActive ? 'text-mesh-accent' : 'text-mesh-dim group-hover:text-mesh-muted',
            )}
            strokeWidth={2.1}
          />
          {!collapsed ? <span className="min-w-0 flex-1 truncate">{label}</span> : null}
          {!collapsed && badge ? (
            <span className="shrink-0 rounded-full bg-mesh-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-mesh-warning">
              {badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  )
}

function GroupLabel({
  label,
  open,
  onToggle,
}: {
  label: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className="mt-3 flex w-full items-center justify-between px-2.5 py-1 text-[11px] font-semibold tracking-wide text-mesh-dim"
      onClick={onToggle}
    >
      {label}
      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
    </button>
  )
}

export function Sidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const used = useAppStore((s) => s.storageUsedGb)
  const total = useAppStore((s) => s.storageTotalGb)
  const free = useAppStore((s) => s.storageFreeGb)
  const runningCount = useAppStore(selectRunningTaskCount)
  const failedCount = useAppStore(selectFailedTaskCount)
  const taskBadge = runningCount + failedCount
  const [capabilityOpen, setCapabilityOpen] = useState(true)
  const [runtimeOpen, setRuntimeOpen] = useState(true)
  const [systemOpen, setSystemOpen] = useState(true)
  const [collapsedMoreOpen, setCollapsedMoreOpen] = useState(false)
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number } | null>(null)
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0

  useEffect(() => {
    if (!collapsed) setCollapsedMoreOpen(false)
  }, [collapsed])

  useLayoutEffect(() => {
    if (!collapsedMoreOpen) {
      setFlyoutPos(null)
      return
    }
    const update = () => {
      const el = moreBtnRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setFlyoutPos({ top: r.top, left: r.right + 8 })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [collapsedMoreOpen])

  useEffect(() => {
    if (!collapsedMoreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCollapsedMoreOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [collapsedMoreOpen])

  return (
    <aside
      className={cn(
        'app-drag relative z-30 flex h-full shrink-0 flex-col border-r border-mesh-border bg-mesh-panel/95 backdrop-blur-xl',
        'overflow-hidden transition-[width] duration-200 ease-out',
        collapsed ? 'w-[72px]' : 'w-[248px]',
      )}
    >
      <div
        className={cn(
          'app-no-drag shrink-0 border-b border-mesh-border/70',
          collapsed ? 'flex flex-col items-center gap-1 px-2 pb-3 pt-3' : 'flex h-14 items-center gap-2.5 px-3',
        )}
      >
        <BrandMark className={cn('shrink-0', collapsed ? 'h-8 w-8' : 'h-8 w-8')} />
        {!collapsed ? (
          <div className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-mesh-text">
            Nexus
          </div>
        ) : null}
        <button
          type="button"
          onClick={toggleSidebar}
          className="rounded-lg p-1.5 text-mesh-dim hover:bg-mesh-cardHover hover:text-mesh-text"
          aria-label={collapsed ? '展开导航' : '折叠导航'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="app-no-drag flex min-h-0 flex-1 flex-col px-2 py-2">
        <div
          className={cn(
            'min-h-0 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden',
            collapsed && 'flex flex-col items-center',
          )}
        >
          <Item to="/dashboard" icon={LayoutDashboard} label="控制中心" collapsed={collapsed} />

          {!collapsed ? (
            <GroupLabel label="能力管理" open={capabilityOpen} onToggle={() => setCapabilityOpen((v) => !v)} />
          ) : (
            <div className="my-2 w-8 border-t border-mesh-border" />
          )}
          {(collapsed || capabilityOpen) && (
            <div className={cn('space-y-0.5', collapsed && 'flex flex-col items-center')}>
              <Item to="/skills/discover" icon={Search} label="发现技能" collapsed={collapsed} />
              <Item to="/skills/mine" icon={Boxes} label="我的技能" collapsed={collapsed} />
              <Item to="/publish" icon={CloudUpload} label="发布技能" collapsed={collapsed} />
            </div>
          )}

          {!collapsed ? (
            <GroupLabel label="运行环境" open={runtimeOpen} onToggle={() => setRuntimeOpen((v) => !v)} />
          ) : (
            <div className="my-2 w-8 border-t border-mesh-border" />
          )}
          {(collapsed || runtimeOpen) && (
            <div className={cn('space-y-0.5', collapsed && 'flex flex-col items-center')}>
              <Item to="/settings/sources" icon={Database} label="技能来源" collapsed={collapsed} />
              <Item to="/settings/agents" icon={Bot} label="智能体管理" collapsed={collapsed} />
            </div>
          )}

          {!collapsed ? (
            <>
              <GroupLabel label="系统" open={systemOpen} onToggle={() => setSystemOpen((v) => !v)} />
              {systemOpen ? (
                <div className="space-y-0.5">
                  <Item
                    to="/tasks"
                    icon={ClipboardList}
                    label={failedCount ? `任务中心 · 失败 ${failedCount}` : '任务中心'}
                    badge={taskBadge || undefined}
                  />
                  <Item to="/settings/storage" icon={HardDrive} label="存储管理" />
                  <Item to="/settings/advanced" icon={SlidersHorizontal} label="设置中心" />
                  <Item to="/settings/guide" icon={BookOpen} label="操作说明" />
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col items-center gap-0.5">
              <Item
                to="/tasks"
                icon={ClipboardList}
                label="任务中心"
                badge={taskBadge || undefined}
                collapsed
              />
              <button
                ref={moreBtnRef}
                type="button"
                className={cn(
                  'app-no-drag flex h-10 w-10 items-center justify-center rounded-xl text-mesh-muted hover:bg-mesh-cardHover hover:text-mesh-text',
                  collapsedMoreOpen && 'bg-mesh-accentSoft text-mesh-accent',
                )}
                onClick={() => setCollapsedMoreOpen((v) => !v)}
                title="更多设置"
              >
                <Settings2 className="h-[17px] w-[17px]" strokeWidth={2.1} />
              </button>
              {collapsedMoreOpen && flyoutPos ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-[190] cursor-default bg-transparent"
                    aria-label="关闭菜单"
                    onClick={() => setCollapsedMoreOpen(false)}
                  />
                  <div
                    className="fixed z-[200] w-48 rounded-xl border border-mesh-border bg-mesh-card p-1 shadow-mesh"
                    style={{ top: flyoutPos.top, left: flyoutPos.left }}
                  >
                    <Item to="/settings/storage" icon={HardDrive} label="存储管理" onNavigate={() => setCollapsedMoreOpen(false)} />
                    <Item to="/settings/advanced" icon={SlidersHorizontal} label="设置中心" onNavigate={() => setCollapsedMoreOpen(false)} />
                    <Item to="/settings/guide" icon={BookOpen} label="操作说明" onNavigate={() => setCollapsedMoreOpen(false)} />
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </nav>

      {!collapsed ? (
        <div className="app-no-drag shrink-0 space-y-2 border-t border-mesh-border p-3 text-xs">
          <div className="mb-1.5 flex items-center justify-between font-medium text-mesh-muted">
            <span>本地存储</span>
            <span>{total > 0 ? `${used} / ${total} GB` : '—'}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-mesh-bg">
            <div className="h-full rounded-full bg-mesh-accent" style={{ width: `${pct}%` }} />
          </div>
          {total > 0 ? <div className="text-[10px] text-mesh-dim">剩余 {free} GB</div> : null}
        </div>
      ) : null}
    </aside>
  )
}
