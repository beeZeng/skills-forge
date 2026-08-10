/**
 * SkillHub session auth for Nexus ↔ Pangu Hub unified account.
 * Uses a persistent Electron session partition so SESSION + XSRF cookies stick.
 */

const { session } = require('electron')

const PARTITION = 'persist:panguhub-auth'

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

async function ensureCsrf(baseUrl) {
  // Spring CookieCsrfTokenRepository issues XSRF-TOKEN on first touch
  await getSession().fetch(`${baseUrl}/api/v1/auth/methods`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  return getCookieValue(baseUrl, 'XSRF-TOKEN')
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
    const csrf = await ensureCsrf(base)
    const { res, body } = await sessionFetch(`${base}/api/v1/auth/local/login`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-XSRF-TOKEN': csrf } : {}),
      },
      body: JSON.stringify({ username, password }),
    })

    if (!res.ok) {
      const msg = body?.msg || body?.message || `登录失败 HTTP ${res.status}`
      return { ok: false, message: msg }
    }

    let data
    try {
      data = unwrapData(body)
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '登录失败' }
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
    return {
      ok: false,
      message: error instanceof Error ? error.message : '登录失败',
    }
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
    await getSession().clearStorageData({ storages: ['cookies'] })
  } catch {
    // ignore
  }
  return { ok: true }
}

async function me({ baseUrl } = {}) {
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
  login,
  logout,
  me,
  myNamespaces,
  sessionGetJson,
  sessionFetch,
  ensureCsrf,
}
