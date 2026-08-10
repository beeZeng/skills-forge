export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`
}

/** Parse timestamps without treating date-only strings as UTC midnight (avoids “N小时前” skew in UTC+8). */
export function parseTimeMs(input?: string | number | null): number | null {
  if (input == null || input === '') return null
  if (typeof input === 'number' && Number.isFinite(input)) return input
  const raw = String(input).trim()
  if (!raw) return null

  // YYYY-MM-DD → local calendar day (compare by day, not UTC midnight)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number)
    return new Date(y, m - 1, d, 12, 0, 0, 0).getTime()
  }

  // ISO datetime without timezone → assume UTC
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const normalized = raw.includes('T') ? `${raw}Z` : `${raw.replace(' ', 'T')}Z`
    const ms = new Date(normalized).getTime()
    return Number.isNaN(ms) ? null : ms
  }

  const ms = new Date(raw).getTime()
  return Number.isNaN(ms) ? null : ms
}

export function formatRelative(iso?: string) {
  if (!iso) return '刚刚'
  const raw = String(iso).trim()
  const parsed = parseTimeMs(raw)
  if (parsed == null) return '刚刚'

  // Date-only fields: show calendar-relative labels (今天 / 昨天 / N天前)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const startOfDay = (ms: number) => {
      const d = new Date(ms)
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    }
    const days = Math.round((startOfDay(Date.now()) - startOfDay(parsed)) / 86400000)
    if (days <= 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 30) return `${days}天前`
    return raw
  }

  const diff = Date.now() - parsed
  if (diff < 0) return '刚刚'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}天前`
  return new Date(parsed).toLocaleDateString('zh-CN')
}

/** Compact count for UI: 12500 → 12.5K */
export function formatCount(n?: number | null) {
  const value = Number(n) || 0
  if (value < 1000) return String(Math.round(value))
  if (value < 10000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`
  if (value < 1000000) return `${Math.round(value / 100) / 10}K`.replace(/\.0K$/, 'K')
  return `${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`
}

/** Install metric for cards — prefer local installs, then catalog downloads (not stars). */
export function skillInstalls(skill: {
  installCount?: number | null
  downloadCount?: number | null
  downloads?: number | null
}) {
  if (typeof skill.installCount === 'number' && Number.isFinite(skill.installCount)) {
    return Math.max(0, skill.installCount)
  }
  if (typeof skill.downloadCount === 'number' && Number.isFinite(skill.downloadCount)) {
    return Math.max(0, skill.downloadCount)
  }
  if (typeof skill.downloads === 'number' && Number.isFinite(skill.downloads)) {
    return Math.max(0, skill.downloads)
  }
  return 0
}
