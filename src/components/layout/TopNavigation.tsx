import { NavLink, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NavItem = {
  to: string
  label: string
  icon?: LucideIcon
  end?: boolean
  /** When true, match any /settings/* except sources/agents. */
  settingsHub?: boolean
}

function isItemActive(pathname: string, item: NavItem) {
  if (item.settingsHub) {
    if (!pathname.startsWith('/settings')) return false
    if (pathname.startsWith('/settings/sources') || pathname.startsWith('/settings/agents')) return false
    return true
  }
  if (item.end) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

export function TopNavigation({
  items,
  className,
  compact = false,
}: {
  items: NavItem[]
  className?: string
  compact?: boolean
}) {
  const { pathname } = useLocation()

  return (
    <nav className={cn('nexus-top-nav', className)} aria-label="主导航">
      {items.map((item) => {
        const active = isItemActive(pathname, item)
        const Icon = item.icon
        return (
          <NavLink
            key={item.to + item.label}
            to={item.to}
            end={item.end}
            className={cn('nexus-nav-pill', active && 'is-active', compact && 'is-compact')}
            title={item.label}
          >
            {active && Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
