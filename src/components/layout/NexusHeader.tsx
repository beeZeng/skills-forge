import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  Bot,
  ChevronDown,
  Compass,
  ListTodo,
  Package,
  Radio,
  Rocket,
  Settings,
  UserRound,
} from 'lucide-react'
import { BrandMark } from '@/components/brand/BrandMark'
import { TopNavigation, type NavItem } from '@/components/layout/TopNavigation'
import { selectFailedTaskCount, selectRunningTaskCount, useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'

/** Left of Nexus, left → right */
const LEFT_NAV: NavItem[] = [
  { to: '/publish', label: '发布技能', icon: Rocket },
  { to: '/skills/mine', label: '我的技能', icon: Package },
  { to: '/skills/discover', label: '发现技能', icon: Compass },
]

/** Right of Nexus, near center → outer (技能来源 → 智能体中心 → 任务中心) */
const RIGHT_NAV: NavItem[] = [
  { to: '/settings/sources', label: '技能来源', icon: Radio },
  { to: '/settings/agents', label: '智能体中心', icon: Bot },
  { to: '/tasks', label: '任务中心', icon: ListTodo },
]

const SETTINGS_ITEM: NavItem = {
  to: '/settings/advanced',
  label: '设置',
  icon: Settings,
  settingsHub: true,
}

const MORE_EXTRA: NavItem[] = [
  { to: '/settings/storage', label: '存储' },
  { to: '/settings/guide', label: '使用指南' },
]

type Breakpoint = 'full' | 'medium' | 'narrow'

function useHeaderBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>('full')
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      if (w < 900) setBp('narrow')
      else if (w < 1240) setBp('medium')
      else setBp('full')
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return bp
}

export function NexusHeader() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const bp = useHeaderBreakpoint()
  const account = useAppStore((s) => s.account)
  const setLoginOpen = useAppStore((s) => s.setLoginOpen)
  const logout = useAppStore((s) => s.logout)
  const notifications = useAppStore((s) => s.notifications)
  const markNotificationsRead = useAppStore((s) => s.markNotificationsRead)
  const markNotificationRead = useAppStore((s) => s.markNotificationRead)
  const setHighlightTaskId = useAppStore((s) => s.setHighlightTaskId)
  const runningCount = useAppStore(selectRunningTaskCount)
  const failedCount = useAppStore(selectFailedTaskCount)

  const [moreOpen, setMoreOpen] = useState(false)
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const notifyRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => !n.read).length
  const taskHint =
    failedCount > 0
      ? `失败 ${failedCount}`
      : runningCount > 0
        ? `进行中 ${runningCount}`
        : null

  const { leftItems, rightItems, moreItems, showSettingsPill } = useMemo(() => {
    if (bp === 'full') {
      return {
        leftItems: LEFT_NAV,
        rightItems: RIGHT_NAV,
        moreItems: MORE_EXTRA,
        showSettingsPill: true,
      }
    }
    if (bp === 'medium') {
      return {
        leftItems: LEFT_NAV,
        rightItems: RIGHT_NAV.slice(0, 2),
        moreItems: [...RIGHT_NAV.slice(2), ...MORE_EXTRA],
        showSettingsPill: true,
      }
    }
    return {
      leftItems: LEFT_NAV.slice(0, 2),
      rightItems: [] as NavItem[],
      moreItems: [...LEFT_NAV.slice(2), ...RIGHT_NAV, SETTINGS_ITEM, ...MORE_EXTRA],
      showSettingsPill: false,
    }
  }, [bp])

  useEffect(() => {
    setMoreOpen(false)
    setNotifyOpen(false)
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!moreOpen && !notifyOpen && !menuOpen) return
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (moreRef.current?.contains(target)) return
      if (notifyRef.current?.contains(target)) return
      if (userRef.current?.contains(target)) return
      setMoreOpen(false)
      setNotifyOpen(false)
      setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false)
        setNotifyOpen(false)
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [moreOpen, notifyOpen, menuOpen])

  return (
    <header className="nexus-header app-drag">
      <div className="nexus-header-grid app-no-drag">
        <div className="nexus-header-left">
          <TopNavigation items={leftItems} />
        </div>

        <button
          type="button"
          className={cn('nexus-brand', pathname === '/dashboard' && 'is-home')}
          onClick={() => navigate('/dashboard')}
          title="控制中心"
        >
          <BrandMark className="h-9 w-9" title="Nexus" />
          <span className="nexus-brand-text">Nexus</span>
        </button>

        <div className="nexus-header-right">
          <TopNavigation items={rightItems} />

          <div className="nexus-header-trailing">
            {showSettingsPill ? <TopNavigation items={[SETTINGS_ITEM]} /> : null}

            {moreItems.length ? (
              <div className="relative" ref={moreRef}>
                <button
                  type="button"
                  className={cn('nexus-nav-pill', moreOpen && 'is-active')}
                  onClick={() => {
                    setMoreOpen((v) => !v)
                    setNotifyOpen(false)
                    setMenuOpen(false)
                  }}
                >
                  更多
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', moreOpen && 'rotate-180')} />
                </button>
                {moreOpen ? (
                  <div className="nexus-menu">
                    {moreItems.map((item) => (
                      <Link
                        key={item.to + item.label}
                        to={item.to}
                        className="nexus-menu-item"
                        onClick={() => setMoreOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="relative" ref={notifyRef}>
              <button
                type="button"
                className="nexus-icon-btn"
                aria-label="通知"
                onClick={() => {
                  setNotifyOpen((v) => !v)
                  setMoreOpen(false)
                  setMenuOpen(false)
                }}
              >
                <Bell className="h-4 w-4" />
                {unreadCount ? <span className="nexus-dot" /> : null}
              </button>
              {notifyOpen ? (
                <div className="nexus-menu nexus-menu-wide">
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-xs font-medium text-mesh-muted">通知</span>
                    {unreadCount ? (
                      <button
                        type="button"
                        className="text-[11px] text-mesh-accent hover:underline"
                        onClick={() => markNotificationsRead()}
                      >
                        全部已读
                      </button>
                    ) : null}
                  </div>
                  {notifications.length ? (
                    notifications.slice(0, 8).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className={cn('nexus-menu-item text-left', !n.read && 'font-medium text-mesh-text')}
                        onClick={() => {
                          markNotificationRead(n.id)
                          setNotifyOpen(false)
                          if (n.taskId) {
                            setHighlightTaskId(n.taskId)
                            navigate(`/tasks?task=${encodeURIComponent(n.taskId)}`)
                          } else {
                            navigate('/tasks')
                          }
                        }}
                      >
                        {n.message}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-3 text-sm text-mesh-dim">暂无通知</div>
                  )}
                </div>
              ) : null}
            </div>

            {taskHint ? (
              <Link to="/tasks" className="nexus-task-chip" title="任务中心">
                {taskHint}
              </Link>
            ) : null}

            <div className="relative" ref={userRef}>
              <button
                type="button"
                className="nexus-avatar"
                onClick={() => {
                  if (!account.loggedIn) {
                    setLoginOpen(true)
                    return
                  }
                  setMenuOpen((v) => !v)
                  setMoreOpen(false)
                  setNotifyOpen(false)
                }}
                title={account.loggedIn ? account.displayName || '账号' : '登录'}
              >
                {account.loggedIn ? (
                  (account.displayName || account.email || '用').slice(0, 1)
                ) : (
                  <UserRound className="h-4 w-4" />
                )}
              </button>
              {menuOpen && account.loggedIn ? (
                <div className="nexus-menu">
                  <div className="border-b border-mesh-border px-3 py-2 text-xs text-mesh-muted">
                    {account.displayName || account.email || '已登录'}
                  </div>
                  <Link to="/settings/advanced" className="nexus-menu-item" onClick={() => setMenuOpen(false)}>
                    账号与设置
                  </Link>
                  <button
                    type="button"
                    className="nexus-menu-item w-full text-left"
                    onClick={() => {
                      setMenuOpen(false)
                      void logout()
                    }}
                  >
                    退出登录
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
