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
          'app-no-drag group flex items-center rounded-mesh font-semibold tracking-tight transition-colors',
          collapsed
            ? 'h-11 w-11 justify-center px-0'
            : 'gap-3 px-2.5 py-2.5 text-[15px]',
          isActive ? 'bg-mesh-accentSoft text-mesh-text' : 'text-mesh-muted hover:bg-mesh-card hover:text-mesh-text',
        )
      }
      title={label}
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              'h-[18px] w-[18px] shrink-0',
              isActive ? 'text-mesh-accent' : 'text-mesh-dim group-hover:text-mesh-muted',
            )}
            strokeWidth={2.25}
          />
          {!collapsed ? <span className="min-w-0 flex-1 truncate">{label}</span> : null}
          {!collapsed && badge ? (
            <span className="shrink-0 rounded-full bg-mesh-warning/20 px-1.5 py-0.5 text-[11px] font-bold text-mesh-warning">
              {badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  )
}

export function Sidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const used = useAppStore((s) => s.storageUsedGb)
  const total = useAppStore((s) => s.storageTotalGb)
  const free = useAppStore((s) => s.storageFreeGb)
  const volumeLabel = useAppStore((s) => s.storageVolumeLabel)
  const runningCount = useAppStore(selectRunningTaskCount)
  const failedCount = useAppStore(selectFailedTaskCount)
  const taskBadge = runningCount + failedCount
  const [skillsOpen, setSkillsOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [collapsedSettingsOpen, setCollapsedSettingsOpen] = useState(false)
  const [settingsFlyoutPos, setSettingsFlyoutPos] = useState<{ top: number; left: number } | null>(null)
  const settingsBtnRef = useRef<HTMLButtonElement>(null)
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0

  useEffect(() => {
    if (!collapsed) setCollapsedSettingsOpen(false)
  }, [collapsed])

  useLayoutEffect(() => {
    if (!collapsedSettingsOpen) {
      setSettingsFlyoutPos(null)
      return
    }
    const update = () => {
      const el = settingsBtnRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setSettingsFlyoutPos({ top: r.top, left: r.right + 8 })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [collapsedSettingsOpen])

  useEffect(() => {
    if (!collapsedSettingsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCollapsedSettingsOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [collapsedSettingsOpen])

  return (
    <aside
      className={cn(
        'app-drag relative z-30 flex h-full shrink-0 flex-col border-r border-mesh-border bg-mesh-panel',
        // Clip label bleed during width animation; settings flyout uses fixed so it won't be clipped.
        'overflow-hidden transition-[width] duration-200 ease-out',
        collapsed ? 'w-[72px]' : 'w-[248px]',
      )}
    >
      {/* Header: expanded = brand+title+toggle; collapsed = brand then toggle (no squeeze) */}
      <div
        className={cn(
          'app-no-drag shrink-0 border-b border-mesh-border/60',
          collapsed ? 'flex flex-col items-center gap-1 px-2 pb-3 pt-3' : 'flex h-14 items-center gap-2.5 px-3',
        )}
      >
        <BrandMark className={cn('shrink-0 drop-shadow-sm', collapsed ? 'h-9 w-9' : 'h-9 w-9')} />
        {!collapsed ? (
          <div className="min-w-0 flex-1 truncate text-base font-bold tracking-tight text-mesh-text">Nexus</div>
        ) : null}
        <button
          type="button"
          onClick={toggleSidebar}
          className="rounded-md p-1.5 text-mesh-dim hover:bg-mesh-card hover:text-mesh-text"
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
          <Item to="/dashboard" icon={LayoutDashboard} label="工作台" collapsed={collapsed} />

          {!collapsed ? (
            <button
              type="button"
              className="mt-3 flex w-full items-center justify-between px-2.5 py-1 text-[12px] font-bold uppercase tracking-wider text-mesh-dim"
              onClick={() => setSkillsOpen((v) => !v)}
            >
              技能
              {skillsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <div className="my-2 w-8 border-t border-mesh-border" />
          )}
          {(collapsed || skillsOpen) && (
            <div className={cn('space-y-0.5', collapsed && 'flex flex-col items-center')}>
              <Item to="/skills/mine" icon={Boxes} label="我的" collapsed={collapsed} />
              <Item to="/skills/discover" icon={Search} label="发现" collapsed={collapsed} />
            </div>
          )}

          <div className={cn('pt-1.5', collapsed && 'flex justify-center')}>
            <Item to="/publish" icon={CloudUpload} label="发布" collapsed={collapsed} />
          </div>

          <div className={cn('my-3 border-t border-mesh-border', collapsed ? 'w-8' : 'w-full')} />

          {!collapsed ? (
            <>
              <button
                type="button"
                className="flex w-full items-center justify-between px-2.5 py-1 text-[12px] font-bold uppercase tracking-wider text-mesh-dim"
                onClick={() => setSettingsOpen((v) => !v)}
              >
                设置
                {settingsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {settingsOpen ? (
                <div className="space-y-0.5">
                  <Item to="/settings/sources" icon={Database} label="技能源配置" />
                  <Item to="/settings/agents" icon={Bot} label="智能体配置" />
                  <Item to="/settings/storage" icon={HardDrive} label="存储管理" />
                  <Item to="/settings/advanced" icon={SlidersHorizontal} label="高级设置" />
                  <Item to="/settings/guide" icon={BookOpen} label="操作说明" />
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex justify-center">
              <button
                ref={settingsBtnRef}
                type="button"
                className={cn(
                  'app-no-drag flex h-11 w-11 items-center justify-center rounded-mesh text-mesh-muted hover:bg-mesh-card hover:text-mesh-text',
                  collapsedSettingsOpen && 'bg-mesh-accentSoft text-mesh-accent',
                )}
                onClick={() => setCollapsedSettingsOpen((v) => !v)}
                title="设置"
                aria-expanded={collapsedSettingsOpen}
              >
                <Settings2 className="h-[18px] w-[18px]" strokeWidth={2.25} />
              </button>
              {collapsedSettingsOpen && settingsFlyoutPos ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-[190] cursor-default bg-transparent"
                    aria-label="关闭设置菜单"
                    onClick={() => setCollapsedSettingsOpen(false)}
                  />
                  <div
                    className="fixed z-[200] w-48 rounded-mesh border border-mesh-border bg-mesh-card p-1 shadow-mesh"
                    style={{ top: settingsFlyoutPos.top, left: settingsFlyoutPos.left }}
                  >
                    <Item
                      to="/settings/sources"
                      icon={Database}
                      label="技能源配置"
                      onNavigate={() => setCollapsedSettingsOpen(false)}
                    />
                    <Item
                      to="/settings/agents"
                      icon={Bot}
                      label="智能体配置"
                      onNavigate={() => setCollapsedSettingsOpen(false)}
                    />
                    <Item
                      to="/settings/storage"
                      icon={HardDrive}
                      label="存储管理"
                      onNavigate={() => setCollapsedSettingsOpen(false)}
                    />
                    <Item
                      to="/settings/advanced"
                      icon={SlidersHorizontal}
                      label="高级设置"
                      onNavigate={() => setCollapsedSettingsOpen(false)}
                    />
                    <Item
                      to="/settings/guide"
                      icon={BookOpen}
                      label="操作说明"
                      onNavigate={() => setCollapsedSettingsOpen(false)}
                    />
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>

        <div
          className={cn(
            'mt-auto shrink-0 border-t border-mesh-border pt-2',
            collapsed && 'flex justify-center',
          )}
        >
          <Item
            to="/tasks"
            icon={ClipboardList}
            label={failedCount ? `任务日志 · 失败 ${failedCount}` : '任务日志'}
            badge={taskBadge || undefined}
            collapsed={collapsed}
          />
        </div>
      </nav>

      {!collapsed ? (
        <div className="app-no-drag shrink-0 space-y-3 border-t border-mesh-border p-3 text-xs">
          <div>
            <div className="mb-1.5 flex items-center justify-between font-semibold text-mesh-muted">
              <span>存储空间{volumeLabel ? ` · ${volumeLabel.replace(/\\$/, '')}` : ''}</span>
              <span>
                {total > 0 ? `${used} / ${total} GB` : '—'}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-mesh-card">
              <div className="h-full rounded-full bg-mesh-accent" style={{ width: `${pct}%` }} />
            </div>
            {total > 0 ? (
              <div className="mt-1 text-[10px] text-mesh-dim">剩余 {free} GB</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </aside>
  )
}
