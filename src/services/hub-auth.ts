import { DEFAULT_PANGU_HUB_URL } from '@/constants/pangu'
import type { AppAccount, SourceNamespace } from '@/types'

export type AuthLoginResult = {
  ok: boolean
  message?: string
  account?: AppAccount
}

export type AuthMeResult = {
  ok: boolean
  loggedIn: boolean
  message?: string
  account?: AppAccount
}

export type AuthNamespacesResult = {
  ok: boolean
  unauthorized?: boolean
  namespaces: SourceNamespace[]
  message?: string
}

function normalizeBaseUrl(input?: string) {
  if (!input) return ''
  let url = input.trim()
  try {
    const parsed = new URL(url)
    url = `${parsed.protocol}//${parsed.host}${parsed.pathname || ''}`
  } catch {
    // keep
  }
  return url
    .replace(/\/+$/, '')
    .replace(/\/actuator\/health$/i, '')
    .replace(/\/+$/, '')
}

/** Browser-dev proxy base for configured Pangu Hub. */
function resolveAuthFetchBase(hubBaseUrl?: string) {
  const base = normalizeBaseUrl(hubBaseUrl || DEFAULT_PANGU_HUB_URL)
  if (typeof window !== 'undefined' && !window.skillMesh?.auth?.login && import.meta.env.DEV) {
    try {
      const u = new URL(base)
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return '/__skillhub'
    } catch {
      // fall through
    }
  }
  return base
}

function unwrapData<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'code' in body) {
    const env = body as { code: number; msg?: string; message?: string; data: T }
    if (env.code !== 0) throw new Error(env.msg || env.message || `业务错误 code=${env.code}`)
    return env.data
  }
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data
  }
  return body as T
}

function mapNamespace(item: {
  slug?: string
  displayName?: string
  currentUserRole?: string
  role?: string
  status?: string
}): SourceNamespace | null {
  if (!item?.slug) return null
  return {
    slug: item.slug,
    displayName: item.displayName || item.slug,
    role: (item.currentUserRole || item.role || 'MEMBER') as SourceNamespace['role'],
    status: item.status || 'ACTIVE',
  }
}

async function readCsrfFromDocument(fetchBase: string) {
  await fetch(`${fetchBase}/api/v1/auth/methods`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : ''
}

async function browserLogin(payload: {
  baseUrl: string
  username: string
  password: string
}): Promise<AuthLoginResult> {
  const logical = normalizeBaseUrl(payload.baseUrl)
  const fetchBase = resolveAuthFetchBase(logical)
  try {
    const csrf = await readCsrfFromDocument(fetchBase)
    const res = await fetch(`${fetchBase}/api/v1/auth/local/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-XSRF-TOKEN': csrf } : {}),
      },
      body: JSON.stringify({ username: payload.username, password: payload.password }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, message: body?.msg || body?.message || `登录失败 HTTP ${res.status}` }
    }
    const data = unwrapData<{
      userId?: string
      displayName?: string
      email?: string
    }>(body)
    return {
      ok: true,
      account: {
        loggedIn: true,
        userId: data?.userId,
        displayName: data?.displayName || payload.username,
        email: data?.email,
        hubBaseUrl: logical,
      },
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '登录失败' }
  }
}

async function browserLogout(baseUrl: string): Promise<{ ok: boolean }> {
  const fetchBase = resolveAuthFetchBase(baseUrl)
  try {
    const csrf = await readCsrfFromDocument(fetchBase)
    await fetch(`${fetchBase}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(csrf ? { 'X-XSRF-TOKEN': csrf } : {}),
      },
    })
  } catch {
    // ignore
  }
  return { ok: true }
}

async function browserMe(baseUrl: string): Promise<AuthMeResult> {
  const logical = normalizeBaseUrl(baseUrl)
  const fetchBase = resolveAuthFetchBase(logical)
  try {
    const res = await fetch(`${fetchBase}/api/v1/auth/me`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, loggedIn: false, message: '未登录' }
    }
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, loggedIn: false, message: body?.msg || `HTTP ${res.status}` }
    }
    const data = unwrapData<{ userId?: string; displayName?: string; email?: string }>(body)
    if (!data?.userId) return { ok: false, loggedIn: false, message: '未登录' }
    return {
      ok: true,
      loggedIn: true,
      account: {
        loggedIn: true,
        userId: data.userId,
        displayName: data.displayName,
        email: data.email,
        hubBaseUrl: logical,
      },
    }
  } catch (error) {
    return {
      ok: false,
      loggedIn: false,
      message: error instanceof Error ? error.message : '校验登录失败',
    }
  }
}

async function browserMyNamespaces(baseUrl: string): Promise<AuthNamespacesResult> {
  const logical = normalizeBaseUrl(baseUrl)
  const fetchBase = resolveAuthFetchBase(logical)
  try {
    const res = await fetch(`${fetchBase}/api/v1/me/namespaces`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, unauthorized: true, namespaces: [], message: '未登录或会话已失效' }
    }
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, namespaces: [], message: body?.msg || `HTTP ${res.status}` }
    }
    const data = unwrapData<unknown>(body)
    const list = Array.isArray(data)
      ? data
      : ((data as { items?: unknown[]; content?: unknown[] })?.items ||
          (data as { content?: unknown[] })?.content ||
          [])
    const namespaces = (Array.isArray(list) ? list : [])
      .map((item) => mapNamespace(item as Parameters<typeof mapNamespace>[0]))
      .filter(Boolean) as SourceNamespace[]
    return { ok: true, namespaces, message: `共 ${namespaces.length} 个命名空间` }
  } catch (error) {
    return {
      ok: false,
      namespaces: [],
      message: error instanceof Error ? error.message : '拉取命名空间失败',
    }
  }
}

export async function hubLogin(payload: {
  baseUrl: string
  username: string
  password: string
}): Promise<AuthLoginResult> {
  const ipc = window.skillMesh?.auth?.login
  if (ipc) return ipc(payload)
  return browserLogin(payload)
}

export async function hubLogout(baseUrl: string): Promise<{ ok: boolean }> {
  const ipc = window.skillMesh?.auth?.logout
  if (ipc) return ipc({ baseUrl })
  return browserLogout(baseUrl)
}

export async function hubMe(baseUrl: string): Promise<AuthMeResult> {
  const ipc = window.skillMesh?.auth?.me
  if (ipc) return ipc({ baseUrl })
  return browserMe(baseUrl)
}

export async function hubMyNamespaces(baseUrl: string): Promise<AuthNamespacesResult> {
  const ipc = window.skillMesh?.auth?.myNamespaces
  if (ipc) return ipc({ baseUrl })
  return browserMyNamespaces(baseUrl)
}

export { normalizeBaseUrl as normalizeHubBaseUrl }
