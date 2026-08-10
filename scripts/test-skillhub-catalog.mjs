#!/usr/bin/env node
/**
 * SkillHub ↔ Nexus 目录连通性测试
 *
 * 用法:
 *   node scripts/test-skillhub-catalog.mjs
 *   SKILLHUB_URL=http://localhost:8080 SKILLHUB_TOKEN=xxx node scripts/test-skillhub-catalog.mjs
 *   node scripts/test-skillhub-catalog.mjs --url http://127.0.0.1:8080 --q key
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const skillhub = require(path.join(__dirname, '../electron/main/registry/skillhub.cjs'))

function parseArgs(argv) {
  const out = {
    url: process.env.SKILLHUB_URL || 'http://localhost:8080',
    token: process.env.SKILLHUB_TOKEN || '',
    q: '',
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--url') out.url = argv[++i]
    else if (a === '--token') out.token = argv[++i]
    else if (a === '--q') out.q = argv[++i] || ''
    else if (a === '--help' || a === '-h') out.help = true
  }
  return out
}

function authHeaders(token) {
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function fetchJson(url, token) {
  const started = Date.now()
  try {
    const res = await fetch(url, { headers: authHeaders(token) })
    const text = await res.text()
    let body = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = { _raw: text.slice(0, 200) }
    }
    return { ok: res.ok, status: res.status, ms: Date.now() - started, body }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      body: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}\n${title}\n${'─'.repeat(60)}`)
}

function pass(msg) {
  console.log(`  ✓ ${msg}`)
}

function fail(msg) {
  console.log(`  ✗ ${msg}`)
}

function info(msg) {
  console.log(`  • ${msg}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`Usage: node scripts/test-skillhub-catalog.mjs [--url URL] [--token TOKEN] [--q QUERY]`)
    process.exit(0)
  }

  const base = skillhub.normalizeBaseUrl(args.url)
  console.log('SkillHub Catalog Probe')
  console.log(`  base : ${base}`)
  console.log(`  token: ${args.token ? '(provided)' : '(none)'}`)
  console.log(`  q    : ${args.q || '(empty)'}`)

  let failed = 0

  section('1) Health')
  const health = await fetchJson(`${base}/actuator/health`, args.token)
  if (health.ok && (health.body?.status === 'UP' || health.status === 200)) {
    pass(`GET /actuator/health → ${health.status} (${health.ms}ms) status=${health.body?.status}`)
  } else {
    fail(`GET /actuator/health → ${health.status || health.error}`)
    failed++
  }

  section('2) CLI search  /api/cli/v1/skills/search')
  const cliUrl = `${base}/api/cli/v1/skills/search?q=${encodeURIComponent(args.q)}&limit=100`
  const cli = await fetchJson(cliUrl, args.token)
  const cliItems = cli.body?.data?.items || []
  if (cli.ok) {
    pass(`HTTP ${cli.status} (${cli.ms}ms) total=${cli.body?.data?.total ?? '?'} items=${cliItems.length}`)
    for (const item of cliItems) {
      info(`${item.namespace}/${item.slug}  v${item.latestVersion}`)
    }
  } else {
    fail(`HTTP ${cli.status || cli.error}`)
    failed++
  }

  section('3) Web list  /api/web/skills')
  const web = await fetchJson(`${base}/api/web/skills?page=0&size=100`, args.token)
  const webItems = web.body?.data?.items || []
  if (web.ok) {
    pass(`HTTP ${web.status} (${web.ms}ms) total=${web.body?.data?.total ?? '?'} items=${webItems.length}`)
    for (const item of webItems) {
      info(
        `${item.namespace}/${item.slug}  ${item.visibility}/${item.status}  published=${item.publishedVersion?.status || '-'}`,
      )
    }
  } else {
    fail(`HTTP ${web.status || web.error}`)
    failed++
  }

  section('4) Portal list  /api/v1/skills')
  const portal = await fetchJson(`${base}/api/v1/skills?limit=100`, args.token)
  const portalItems = portal.body?.items || portal.body?.data?.items || []
  if (portal.ok) {
    pass(`HTTP ${portal.status} (${portal.ms}ms) items=${portalItems.length}`)
    for (const item of portalItems) {
      const ver = item.latestVersion?.version || item.latestVersion || '-'
      info(`${item.slug}  display=${item.displayName}  v${ver}`)
    }
  } else {
    fail(`HTTP ${portal.status || portal.error}`)
    failed++
  }

  section('5) Nexus client  sources:listSkills (skillhub.cjs)')
  const listed = await skillhub.listSkills({
    registryUrl: base,
    token: args.token || undefined,
    sourceId: 'local-skillhub',
    sourceName: '本地 SkillHub',
    query: args.q,
    limit: 200,
  })
  if (listed.ok) {
    pass(`${listed.message}`)
    for (const skill of listed.skills) {
      info(`uid=${skill.uid}  name=${skill.name}  v${skill.version}`)
    }
  } else {
    fail(listed.message || 'listSkills failed')
    failed++
  }

  section('6) Consistency')
  const cliKeys = new Set(cliItems.map((i) => `${i.namespace}/${i.slug}`))
  const meshKeys = new Set(listed.skills.map((s) => `${s.namespace}/${s.skillId}`))
  const missingInMesh = [...cliKeys].filter((k) => !meshKeys.has(k))
  const extraInMesh = [...meshKeys].filter((k) => !cliKeys.has(k))

  if (cli.ok && listed.ok && missingInMesh.length === 0 && extraInMesh.length === 0) {
    pass(`CLI 与 Mesh client 一致（${cliKeys.size} 个 Skill）`)
  } else {
    if (missingInMesh.length) {
      fail(`CLI 有但 Mesh client 缺失: ${missingInMesh.join(', ')}`)
      failed++
    }
    if (extraInMesh.length) {
      fail(`Mesh client 多出: ${extraInMesh.join(', ')}`)
      failed++
    }
    if (!cli.ok || !listed.ok) {
      fail('跳过一致性比对（前置请求失败）')
      failed++
    }
  }

  // Same slug in multiple namespaces — UI 易混淆
  const slugCount = new Map()
  for (const item of cliItems) {
    slugCount.set(item.slug, (slugCount.get(item.slug) || 0) + 1)
  }
  const dupes = [...slugCount.entries()].filter(([, n]) => n > 1)
  if (dupes.length) {
    section('⚠ 同名 slug（发现页看起来像重复）')
    for (const [slug, n] of dupes) {
      info(`slug="${slug}" 出现 ${n} 次 → 请看 namespace 区分`)
      for (const item of cliItems.filter((i) => i.slug === slug)) {
        info(`  - ${item.namespace}/${item.slug}`)
      }
    }
  }

  section('Result')
  if (failed === 0) {
    console.log('  ALL PASSED')
    console.log('\n若脚本能列出 Skill，但 App 里看不到：')
    console.log('  1. 确认使用桌面端（npm run dev），不是纯浏览器预览')
    console.log('  2. 设置 → SkillHub 源 → 地址为', base)
    console.log('  3. 发现页点击「刷新列表」')
    process.exit(0)
  }
  console.log(`  FAILED (${failed} check(s))`)
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
