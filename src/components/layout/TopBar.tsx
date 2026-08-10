import { Bell, Loader2, Search, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { selectFailedTaskCount, selectRunningTaskCount, useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'

const SEARCH_ROUTES = new Set(['/skills/mine', '/skills/discover'])

export function TopBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const showSearch = SEARCH_ROUTES.has(pathname)
  const isMine = pathname === '/skills/mine'
  const discoverSearchQuery = useAppStore((s) => s.discoverSearchQuery)
  const setDiscoverSearchQuery = useAppStore((s) => s.setDiscoverSearchQuery)
  const installedSearchQuery = useAppStore((s) => s.installedSearchQuery)
  const setInstalledSearchQuery = useAppStore((s) => s.setInstalledSearchQuery)
  const notifications = useAppStore((s) => s.notifications)
  const markNotificationsRead = useAppStore((s) => s.markNotificationsRead)
  const markNotificationRead = useAppStore((s) => s.markNotificationRead)
  const setHighlightTaskId = useAppStore((s) => s.setHighlightTaskId)
  const runningCount = useAppStore(selectRunningTaskCount)
  const failedCount = useAppStore(selectFailedTaskCount)
  const account = useAppStore((s) => s.account)
  const setLoginOpen = useAppStore((s) => s.setLoginOpen)
  const logout = useAppStore((s) => s.logout)
  const running = runningCount > 0
  const inputRef = useRef<HTMLInputElement>(null)
  const notifyRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const leaveTimer = useRef<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifyOpen, setNotifyOpen] = useState(false)

  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    if (!showSearch) return
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSearch])

  useEffect(() => {
    return () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
    }
  }, [])

  const clearLeaveTimer = () => {
    if (leaveTimer.current) {
      window.clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
  }

  const scheduleClose = () => {
    clearLeaveTimer()
    leaveTimer.current = window.setTimeout(() => {
      setNotifyOpen(false)
    }, 3000)
  }

  const searchValue = isMine ? installedSearchQuery : discoverSearchQuery
  const searchPlaceholder = isMine ? '搜索名称、描述或标签...' : '搜索名称、描述或标签...'

  const handleSearchChange = (value: string) => {
    if (isMine) {
      setInstalledSearchQuery(value)
      return
    }
    setDiscoverSearchQuery(value)
  }

  const logLabel =
    failedCount > 0
      ? `日志 · 进行中 ${runningCount} · 失败 ${failedCount}`
      : `日志 ${runningCount || 0}`

  useEffect(() => {
    if (!notifyOpen && !menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (notifyRef.current?.contains(target) || userMenuRef.current?.contains(target)) return
      setNotifyOpen(false)
      setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotifyOpen(false)
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [notifyOpen, menuOpen])

  return (
    <header className="app-drag relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-mesh-border bg-mesh-panel px-4">
      {showSearch ? (
        <div className="app-no-drag mx-auto flex w-full max-w-3xl items-center gap-2 rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2 focus-within:border-mesh-accent">
          <Search className="h-4 w-4 text-mesh-dim" />
          <input
            ref={inputRef}
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-sm outline-none placeholder:text-mesh-dim"
          />
          <kbd className="hidden rounded border border-mesh-border px-1.5 py-0.5 text-[10px] text-mesh-dim sm:inline">
            ⌘K
          </kbd>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="app-no-drag ml-auto flex items-center gap-1.5">
        <div
          ref={notifyRef}
          className="relative"
          onMouseEnter={clearLeaveTimer}
          onMouseLeave={() => {
            if (notifyOpen) scheduleClose()
          }}
        >
          <button
            type="button"
            className="rounded-mesh p-2 text-mesh-muted hover:bg-mesh-card hover:text-mesh-text"
            onClick={() => {
              clearLeaveTimer()
              setMenuOpen(false)
              setNotifyOpen((v) => !v)
            }}
            aria-label="通知"
            aria-expanded={notifyOpen}
          >
            <Bell className="h-4 w-4" />
            {unreadCount ? (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-mesh-accent" />
            ) : null}
          </button>
          {notifyOpen ? (
            <div className="absolute right-0 top-full z-50 mt-2 max-h-[min(24rem,70vh)] w-80 overflow-y-auto rounded-mesh border border-mesh-border bg-mesh-card p-2 shadow-mesh">
              <div className="flex items-center justify-between px-2 py-1.5">
                <div className="text-xs font-medium text-mesh-muted">通知</div>
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
                    className={cn(
                      'block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-mesh-cardHover',
                      n.read ? 'text-mesh-muted' : 'text-mesh-text',
                    )}
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
                <div className="px-2 py-3 text-sm text-mesh-dim">暂无通知</div>
              )}
            </div>
          ) : null}
        </div>

        <Link
          to="/tasks"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-mesh px-2.5 py-1.5 text-xs text-mesh-muted hover:bg-mesh-card hover:text-mesh-text',
            failedCount > 0 && 'text-mesh-danger',
            running && !failedCount && 'text-mesh-warning',
          )}
          title={logLabel}
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {logLabel}
        </Link>

        <div ref={userMenuRef} className="relative">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-mesh-card text-mesh-muted hover:text-mesh-text"
            onClick={() => {
              setMenuOpen((v) => !v)
              setNotifyOpen(false)
            }}
            aria-label="用户菜单"
            aria-expanded={menuOpen}
          >
            <UserRound className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-mesh border border-mesh-border bg-mesh-card p-1 shadow-mesh">
              <div className="px-2 py-2 text-xs text-mesh-dim">
                {account.loggedIn
                  ? account.displayName || account.userId || '已登录'
                  : '游客（仅公共 Skill）'}
              </div>
              {account.loggedIn && account.email ? (
                <div className="truncate px-2 pb-1 text-[11px] text-mesh-dim">{account.email}</div>
              ) : null}
              {!account.loggedIn ? (
                <button
                  type="button"
                  className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-mesh-cardHover"
                  onClick={() => {
                    setMenuOpen(false)
                    setLoginOpen(true)
                  }}
                >
                  登录 SkillHub
                </button>
              ) : (
                <button
                  type="button"
                  className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-mesh-cardHover"
                  onClick={() => {
                    setMenuOpen(false)
                    void logout()
                  }}
                >
                  退出登录
                </button>
              )}
              <Link
                to="/settings/sources"
                className="block rounded-md px-2 py-2 text-sm hover:bg-mesh-cardHover"
                onClick={() => setMenuOpen(false)}
              >
                技能源配置
              </Link>
              <Link
                to="/settings/advanced"
                className="block rounded-md px-2 py-2 text-sm hover:bg-mesh-cardHover"
                onClick={() => setMenuOpen(false)}
              >
                偏好设置
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
