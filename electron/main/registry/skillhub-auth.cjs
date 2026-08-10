/**
 * SkillHub session auth for Nexus ↔ Pangu Hub unified account.
 * Uses a persistent Electron session partition so SESSION + XSRF cookies stick.
 */

const { session } = require('electron')

const PARTITION = 'persist:panguhub-auth'
/** Keep auth cookies across app restarts for the same window as the UI session. */
const SESSION_TTL_MS = 48 * 60 * 60 * 1000

function normalizeBaseUrl(input) {
  if (!input || typeof input !== 'string') return ''
  let url = input.trim()
  try {
    const parsed = new URL(url)
    url = `${parsed.protocol}//${parsed.host}${parsed.pathname || ''}`
  } catch {
    // keep raw
  }
  return url
    .replace(/\/+$/, '')
    .replace(/\/actuator\/health$/i, '')
    .replace(/\/api\/cli\/v1\/skills\/search$/i, '')
    .replace(/\/api\/v1\/skills$/i, '')
    .replace(/\/registry$/i, '')
    .replace(/\/+$/, '')
}

function getSession() {
  return session.fromPartition(PARTITION)
}

async function readBody(res) {
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  return { body, text }
}

async function getCookieValue(baseUrl, name) {
  const cookies = await getSession().cookies.get({ url: baseUrl })
  return cookies.find((c) => c.name === name)?.value
}

/**
 * Spring often issues SESSION as a browser session cookie (no Expires).
 * Electron drops those on quit — rewrite with an absolute expiry so login
 * survives restarts until the client 48h window ends.
 */
async function persistAuthCookies(baseUrl, ttlMs = SESSION_TTL_MS) {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return
  const ses = getSession()
  const cookies = await ses.cookies.get({ url: base })
  const expirationDate = Math.floor((Date.now() + ttlMs) / 1000)
  for (const cookie of cookies) {
    const basePayload = {
      url: base,
      name: cookie.name,
      value: cookie.value,
      path: cookie.path || '/',
      secure: !!cookie.secure,
      httpOnly: !!cookie.httpOnly,
      expirationDate,
    }
    if (cookie.sameSite && cookie.sameSite !== 'unspecified') {
      basePayload.sameSite = cookie.sameSite
    }
    try {
      // Host-only write via url (most reliable across restarts).
      await ses.cookies.set(basePayload)
    } catch {
      try {
        if (cookie.domain) {
          await ses.cookies.set({ ...basePayload, domain: cookie.domain })
        }
      } catch {
        // Best-effort — skip cookies Electron rejects.
      }
    }
  }
  try {
    await ses.cookies.flushStore()
  } catch {
    // ignore
  }
}

async function clearAuthCookies() {
  try {
    await getSession().clearStorageData({ storages: ['cookies'] })
  } catch {
    // ignore
  }
}

async function ensureCsrf(baseUrl) {
  // Spring CookieCsrfTokenRepository issues XSRF-TOKEN on first touch
  await getSession().fetch(`${baseUrl}/api/v1/auth/methods`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  return getCookieValue(baseUrl, 'XSRF-TOKEN')
}

function loginFailureMessage(res, body, text) {
  const fromBody = body?.msg || body?.message
  if (fromBody) return String(fromBody)
  const status = res?.status
  const raw = String(text || '')
  const isTunnelDown =
    status === 530 ||
    /error[\s-]?1033|cloudflare tunnel error|argo tunnel|trycloudflare/i.test(raw)
  if (isTunnelDown) {
    return [
      '无法连接 SkillHub：Cloudflare Tunnel 未在线（HTTP 530 / 1033）。',
      'DNS/ping 通不代表隧道可用——请在跑 SkillHub 的机器上确认 cloudflared 正在运行，',
      '并用浏览器打开同一地址验证；若是临时 trycloudflare 链接，重启后地址会变，需更新登录框中的 Hub 地址。',
    ].join('')
  }
  if (status === 502 || status === 503 || status === 504) {
    return `SkillHub 暂时不可用（HTTP ${status}），请确认服务已启动后重试`
  }
  if (status === 401 || status === 403) {
    return '用户名或密码错误，或 CSRF 校验失败'
  }
  if (status) return `登录失败 HTTP ${status}`
  return '登录失败'
}

async function sessionFetch(url, { method = 'GET', headers = {}, body, timeoutMs = 12000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await getSession().fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    })
    const parsed = await readBody(res)
    return { res, ...parsed }
  } finally {
    clearTimeout(timer)
  }
}

function mapNamespace(item) {
  if (!item || !item.slug) return null
  return {
    slug: item.slug,
    displayName: item.displayName || item.slug,
    role: item.currentUserRole || item.role || 'MEMBER',
    status: item.status || 'ACTIVE',
  }
}

function unwrapData(body) {
  if (body == null) return null
  if (typeof body.code === 'number') {
    if (body.code !== 0) {
      const err = new Error(body.msg || body.message || `业务错误 code=${body.code}`)
      err.code = body.code
      throw err
    }
    return body.data
  }
  return body.data !== undefined ? body.data : body
}

async function login({ baseUrl, username, password } = {}) {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return { ok: false, message: '缺少 Hub 地址' }
  if (!username || !password) return { ok: false, message: '请输入用户名和密码' }

  try {
    // Drop stale SESSION/XSRF from a previous half-dead session so re-login is clean.
    await clearAuthCookies()
    const csrf = await ensureCsrf(base)
    const { res, body, text } = await sessionFetch(`${base}/api/v1/auth/local/login`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-XSRF-TOKEN': csrf } : {}),
      },
      body: JSON.stringify({ username, password }),
    })

    if (!res.ok) {
      return { ok: false, message: loginFailureMessage(res, body, text), status: res.status }
    }

    if (body == null) {
      return {
        ok: false,
        message: loginFailureMessage(res, null, text) || '登录失败：服务器返回了非 JSON 响应',
        status: res.status,
      }
    }

    let data
    try {
      data = unwrapData(body)
    } catch (error) {
      const code = error && typeof error.code === 'number' ? error.code : undefined
      return {
        ok: false,
        message: error instanceof Error ? error.message : '登录失败',
        status: code,
      }
    }

    try {
      await persistAuthCookies(base, SESSION_TTL_MS)
    } catch {
      // Login already succeeded; cookie persistence is best-effort.
    }

    return {
      ok: true,
      account: {
        loggedIn: true,
        userId: data?.userId,
        displayName: data?.displayName || username,
        email: data?.email,
        hubBaseUrl: base,
      },
    }
  } catch (error) {
    const raw = error instanceof Error ? error.message : '登录失败'
    const message = /aborted|timeout|network|ENOTFOUND|ECONNREFUSED/i.test(raw)
      ? `无法连接 SkillHub：${raw}。请检查 Hub 地址与网络`
      : raw
    return { ok: false, message }
  }
}

async function logout({ baseUrl } = {}) {
  const base = normalizeBaseUrl(baseUrl)
  try {
    if (base) {
      const csrf = await ensureCsrf(base)
      await sessionFetch(`${base}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          ...(csrf ? { 'X-XSRF-TOKEN': csrf } : {}),
        },
      })
    }
  } catch {
    // ignore network errors on logout
  }
  try {
    await clearAuthCookies()
  } catch {
    // ignore
  }
  return { ok: true }
}

async function me({ baseUrl, persistTtlMs } = {}) {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return { ok: false, loggedIn: false, message: '缺少 Hub 地址' }
  try {
    const { res, body } = await sessionFetch(`${base}/api/v1/auth/me`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, loggedIn: false, message: '未登录' }
    }
    if (!res.ok) {
      return { ok: false, loggedIn: false, message: body?.msg || `HTTP ${res.status}` }
    }
    const data = unwrapData(body)
    if (!data?.userId) {
      return { ok: false, loggedIn: false, message: '未登录' }
    }
    // Migrate session cookies → persistent for remaining client TTL (e.g. after upgrade).
    const ttl =
      typeof persistTtlMs === 'number' && persistTtlMs > 0
        ? persistTtlMs
        : SESSION_TTL_MS
    const cookies = await getSession().cookies.get({ url: base })
    if (cookies.some((c) => c.session || !c.expirationDate)) {
      await persistAuthCookies(base, ttl)
    }
    return {
      ok: true,
      loggedIn: true,
      account: {
        loggedIn: true,
        userId: data.userId,
        displayName: data.displayName,
        email: data.email,
        hubBaseUrl: base,
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

async function myNamespaces({ baseUrl } = {}) {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return { ok: false, namespaces: [], message: '缺少 Hub 地址' }
  try {
    const { res, body } = await sessionFetch(`${base}/api/v1/me/namespaces`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, unauthorized: true, namespaces: [], message: '未登录或会话已失效' }
    }
    if (!res.ok) {
      return { ok: false, namespaces: [], message: body?.msg || `HTTP ${res.status}` }
    }
    const data = unwrapData(body)
    const list = Array.isArray(data) ? data : data?.items || data?.content || []
    const namespaces = list.map(mapNamespace).filter(Boolean)
    return { ok: true, namespaces, message: `共 ${namespaces.length} 个命名空间` }
  } catch (error) {
    return {
      ok: false,
      namespaces: [],
      message: error instanceof Error ? error.message : '拉取命名空间失败',
    }
  }
}

/** Session-aware fetch for registry list/publish on the same partition. */
async function sessionGetJson(url, { timeoutMs = 10000 } = {}) {
  return sessionFetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    timeoutMs,
  })
}

module.exports = {
  PARTITION,
  getSession,
  normalizeBaseUrl,
  persistAuthCookies,
  clearAuthCookies,
  SESSION_TTL_MS,
  login,
  logout,
  me,
  myNamespaces,
  sessionGetJson,
  sessionFetch,
  ensureCsrf,
}
