/**
 * SkillHub publish / withdraw-review / delete via session cookies (same as SkillHub web).
 */
const fs = require('fs')
const path = require('path')
const { Blob } = require('buffer')
const skillhubAuth = require('./skillhub-auth.cjs')

function cleanNs(namespace) {
  if (!namespace) return ''
  return String(namespace).startsWith('@') ? String(namespace).slice(1) : String(namespace)
}

function apiMessage(body, fallback) {
  return body?.msg || body?.message || fallback
}

function unwrap(body) {
  if (body == null) return null
  if (typeof body.code === 'number') {
    if (body.code !== 0) {
      const err = new Error(apiMessage(body, `业务错误 code=${body.code}`))
      err.code = body.code
      err.serverMessage = apiMessage(body, '')
      throw err
    }
    return body.data
  }
  return body.data !== undefined ? body.data : body
}

async function withCsrf(baseUrl, headers = {}) {
  const csrf = await skillhubAuth.ensureCsrf(baseUrl)
  return {
    Accept: 'application/json',
    ...(csrf ? { 'X-XSRF-TOKEN': csrf } : {}),
    ...headers,
  }
}

/**
 * POST /api/web/skills/{namespace}/publish  multipart: file, visibility, confirmWarnings
 */
async function publishSkill({ baseUrl, namespace, visibility, zipPath, confirmWarnings = false } = {}) {
  const base = skillhubAuth.normalizeBaseUrl(baseUrl)
  const ns = cleanNs(namespace)
  if (!base) return { ok: false, message: '缺少 Hub 地址' }
  if (!ns) return { ok: false, message: '请选择命名空间' }
  if (!zipPath || !fs.existsSync(zipPath)) return { ok: false, message: '缺少技能包 zip' }
  const vis = String(visibility || 'PUBLIC').toUpperCase()
  if (!['PUBLIC', 'NAMESPACE_ONLY', 'PRIVATE'].includes(vis)) {
    return { ok: false, message: '可见性无效' }
  }

  try {
    const headers = await withCsrf(base)
    const buf = fs.readFileSync(zipPath)
    const form = new FormData()
    const filename = path.basename(zipPath) || 'skill.zip'
    form.append('file', new Blob([buf], { type: 'application/zip' }), filename)
    form.append('visibility', vis)
    form.append('confirmWarnings', String(confirmWarnings === true))

    const { res, body } = await skillhubAuth.sessionFetch(
      `${base}/api/web/skills/${encodeURIComponent(ns)}/publish`,
      {
        method: 'POST',
        headers,
        body: form,
        timeoutMs: 120000,
      },
    )

    if (!res.ok) {
      const message = apiMessage(body, `发布失败 HTTP ${res.status}`)
      return {
        ok: false,
        status: res.status,
        message,
        confirmRequired: /confirm|预检|警告|warning/i.test(message),
        serverMessage: message,
      }
    }

    let data
    try {
      data = unwrap(body)
    } catch (error) {
      const message = error instanceof Error ? error.message : '发布失败'
      return {
        ok: false,
        message,
        confirmRequired: /confirm|预检|警告|warning/i.test(message),
        serverMessage: message,
      }
    }

    return {
      ok: true,
      result: {
        skillId: data?.skillId,
        namespace: data?.namespace || ns,
        slug: data?.slug,
        version: data?.version,
        status: data?.status,
        fileCount: data?.fileCount,
        totalSize: data?.totalSize,
      },
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '发布失败' }
  }
}

async function withdrawReview({ baseUrl, namespace, slug, version } = {}) {
  const base = skillhubAuth.normalizeBaseUrl(baseUrl)
  const ns = cleanNs(namespace)
  if (!base || !ns || !slug || !version) {
    return { ok: false, message: '缺少命名空间 / slug / 版本' }
  }
  try {
    const headers = await withCsrf(base)
    const url = `${base}/api/web/skills/${encodeURIComponent(ns)}/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}/withdraw-review`
    const { res, body } = await skillhubAuth.sessionFetch(url, {
      method: 'POST',
      headers,
      timeoutMs: 30000,
    })
    if (!res.ok) {
      return { ok: false, message: apiMessage(body, `撤回失败 HTTP ${res.status}`) }
    }
    try {
      unwrap(body)
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '撤回失败' }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '撤回失败' }
  }
}

async function deleteSkill({ baseUrl, namespace, slug, ownerId } = {}) {
  const base = skillhubAuth.normalizeBaseUrl(baseUrl)
  const ns = cleanNs(namespace)
  if (!base || !ns || !slug) {
    return { ok: false, message: '缺少命名空间或 slug' }
  }
  try {
    const headers = await withCsrf(base)
    const qs = ownerId ? `?ownerId=${encodeURIComponent(ownerId)}` : ''
    const url = `${base}/api/web/skills/${encodeURIComponent(ns)}/${encodeURIComponent(slug)}${qs}`
    const { res, body } = await skillhubAuth.sessionFetch(url, {
      method: 'DELETE',
      headers,
      timeoutMs: 30000,
    })
    if (!res.ok) {
      return { ok: false, message: apiMessage(body, `删除失败 HTTP ${res.status}`) }
    }
    try {
      unwrap(body)
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '删除失败' }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '删除失败' }
  }
}

/**
 * GET /api/web/skills/{namespace}/{slug}/versions/{version}
 * Prefer version endpoint; fall back to skill detail lifecycle fields.
 */
async function getSkillVersionStatus({ baseUrl, namespace, slug, version } = {}) {
  const base = skillhubAuth.normalizeBaseUrl(baseUrl)
  const ns = cleanNs(namespace)
  if (!base || !ns || !slug || !version) {
    return { ok: false, message: '缺少命名空间 / slug / 版本' }
  }
  try {
    const headers = { Accept: 'application/json' }
    const versionUrl = `${base}/api/web/skills/${encodeURIComponent(ns)}/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}`
    const { res, body } = await skillhubAuth.sessionFetch(versionUrl, {
      method: 'GET',
      headers,
      timeoutMs: 15000,
    })
    if (res.ok) {
      const data = unwrap(body)
      const status = data?.status || data?.versionStatus
      if (status) {
        return {
          ok: true,
          status: String(status),
          version: data?.version || version,
          reviewComment: data?.reviewComment || data?.rejectReason || undefined,
        }
      }
    }

    // Fallback: skill detail lifecycle pointers (owner preview / published)
    const detailUrl = `${base}/api/web/skills/${encodeURIComponent(ns)}/${encodeURIComponent(slug)}`
    const detail = await skillhubAuth.sessionFetch(detailUrl, {
      method: 'GET',
      headers,
      timeoutMs: 15000,
    })
    if (!detail.res.ok) {
      return { ok: false, message: apiMessage(detail.body, `查询失败 HTTP ${detail.res.status}`) }
    }
    const data = unwrap(detail.body)
    const candidates = [
      data?.ownerPreviewVersion,
      data?.publishedVersion,
      data?.headlineVersion,
    ].filter(Boolean)
    const matched = candidates.find((v) => String(v.version) === String(version))
    if (matched?.status) {
      return {
        ok: true,
        status: String(matched.status),
        version: String(matched.version),
        reviewComment: data?.ownerPreviewReviewComment || undefined,
      }
    }
    // If publishedVersion exists and our version matches any published, treat as published
    if (data?.publishedVersion?.version === version) {
      return { ok: true, status: 'PUBLISHED', version }
    }
    return { ok: false, message: '未找到对应版本状态' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '查询版本状态失败' }
  }
}

module.exports = {
  publishSkill,
  withdrawReview,
  deleteSkill,
  getSkillVersionStatus,
}
