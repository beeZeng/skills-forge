const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { app, shell } = require('electron')
const { isValidSemVer, isNewer, compareSemVer } = require('./semver.cjs')

/**
 * App updater — feed-based SemVer check, download installer, apply with backup/rollback.
 *
 * Feed JSON shape:
 * {
 *   "version": "1.1.0",
 *   "notes": "changelog markdown/text",
 *   "publishedAt": "2026-08-10T00:00:00.000Z",
 *   "downloads": {
 *     "win32-x64": "https://.../Nexus-Setup-1.1.0.exe",
 *     "darwin-arm64": "https://.../Nexus-1.1.0-arm64.dmg",
 *     "darwin-x64": "https://.../Nexus-1.1.0-x64.dmg"
 *   }
 * }
 */

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

function platformKey() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (process.platform === 'win32') return `win32-${arch}`
  if (process.platform === 'darwin') return `darwin-${arch}`
  return `${process.platform}-${arch}`
}

function createAppUpdater({ dataRoot }) {
  const updatesRoot = path.join(dataRoot, 'updates')
  const downloadsDir = path.join(updatesRoot, 'downloads')
  const rollbackDir = path.join(updatesRoot, 'rollback')
  const stateFile = path.join(updatesRoot, 'update-state.json')
  const feedConfigFile = path.join(dataRoot, 'update-feed.json')

  fs.mkdirSync(downloadsDir, { recursive: true })
  fs.mkdirSync(rollbackDir, { recursive: true })

  function readPackageVersion() {
    try {
      const pkgPath = path.join(app.getAppPath(), 'package.json')
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      return String(pkg.version || '0.0.0')
    } catch {
      return app.getVersion?.() || '0.0.0'
    }
  }

  function loadState() {
    return readJson(stateFile, {
      lastCheckedAt: null,
      lastResult: null,
      pendingInstall: null,
      lastGood: null,
    })
  }

  function saveState(patch) {
    const next = { ...loadState(), ...patch, updatedAt: new Date().toISOString() }
    writeJson(stateFile, next)
    return next
  }

  function resolveFeedUrl() {
    const fromEnv = (process.env.NEXUS_UPDATE_FEED_URL || '').trim()
    if (fromEnv) return fromEnv
    const cfg = readJson(feedConfigFile, null)
    if (cfg && typeof cfg.url === 'string' && cfg.url.trim()) return cfg.url.trim()
    return ''
  }

  function setFeedUrl(url) {
    const value = String(url || '').trim()
    writeJson(feedConfigFile, { url: value, updatedAt: new Date().toISOString() })
    return { ok: true, url: value }
  }

  function getVersionInfo() {
    const current = readPackageVersion()
    const state = loadState()
    const feedUrl = resolveFeedUrl()
    return {
      ok: true,
      current,
      currentValid: isValidSemVer(current),
      latest: state.lastResult?.latest || null,
      notes: state.lastResult?.notes || '',
      publishedAt: state.lastResult?.publishedAt || null,
      updateAvailable: Boolean(state.lastResult?.updateAvailable),
      lastCheckedAt: state.lastCheckedAt,
      feedUrl,
      platform: platformKey(),
      pendingInstall: state.pendingInstall,
      canRollback: Boolean(state.lastGood?.installerPath && fs.existsSync(state.lastGood.installerPath)),
      lastGoodVersion: state.lastGood?.version || null,
      programPath: app.getPath('exe'),
      userDataPath: app.getPath('userData'),
      dataRoot,
    }
  }

  async function fetchFeed(feedUrl) {
    const res = await fetch(feedUrl, {
      headers: { Accept: 'application/json', 'User-Agent': `Nexus/${readPackageVersion()}` },
    })
    if (!res.ok) throw new Error(`更新源 HTTP ${res.status}`)
    const body = await res.json()
    if (!body || typeof body !== 'object') throw new Error('更新源返回无效 JSON')
    if (!isValidSemVer(body.version)) throw new Error(`更新源版本号非法：${body.version}`)
    return body
  }

  async function checkForUpdates({ force = false } = {}) {
    const current = readPackageVersion()
    const feedUrl = resolveFeedUrl()
    if (!feedUrl) {
      const result = {
        ok: true,
        current,
        latest: null,
        notes: '',
        publishedAt: null,
        updateAvailable: false,
        skipped: true,
        message: '未配置更新源（可设置 NEXUS_UPDATE_FEED_URL 或 update-feed.json）',
      }
      saveState({ lastCheckedAt: new Date().toISOString(), lastResult: result })
      return result
    }

    try {
      const feed = await fetchFeed(feedUrl)
      const key = platformKey()
      const downloadUrl =
        (feed.downloads && (feed.downloads[key] || feed.downloads[process.platform])) ||
        feed.url ||
        null
      const updateAvailable = isNewer(feed.version, current)
      const result = {
        ok: true,
        current,
        latest: feed.version,
        notes: String(feed.notes || feed.changelog || ''),
        publishedAt: feed.publishedAt || null,
        updateAvailable,
        downloadUrl,
        platform: key,
        force: Boolean(force),
        compare: compareSemVer(feed.version, current),
        message: updateAvailable
          ? `发现新版本 ${feed.version}`
          : `已是最新版本（${current}）`,
      }
      saveState({ lastCheckedAt: new Date().toISOString(), lastResult: result })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const result = {
        ok: false,
        current,
        latest: null,
        notes: '',
        updateAvailable: false,
        error: message,
        message: `检查更新失败：${message}`,
      }
      saveState({ lastCheckedAt: new Date().toISOString(), lastResult: result })
      return result
    }
  }

  function installerExt() {
    if (process.platform === 'win32') return '.exe'
    if (process.platform === 'darwin') return '.dmg'
    return '.bin'
  }

  async function downloadUpdate({ url, version } = {}) {
    const state = loadState()
    const downloadUrl = url || state.lastResult?.downloadUrl
    const latest = version || state.lastResult?.latest
    if (!downloadUrl) return { ok: false, error: '没有可下载的安装包地址' }
    if (!latest || !isValidSemVer(latest)) return { ok: false, error: '目标版本无效' }

    const fileName = `Nexus-${latest}-${platformKey()}${installerExt()}`
    const targetPath = path.join(downloadsDir, fileName)
    const tmpPath = `${targetPath}.part`

    try {
      const res = await fetch(downloadUrl, {
        headers: { 'User-Agent': `Nexus/${readPackageVersion()}` },
      })
      if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      fs.writeFileSync(tmpPath, buf)
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath)
      fs.renameSync(tmpPath, targetPath)

      const pendingInstall = {
        version: latest,
        fromVersion: readPackageVersion(),
        installerPath: targetPath,
        downloadUrl,
        downloadedAt: new Date().toISOString(),
        size: buf.length,
      }
      saveState({ pendingInstall })
      return { ok: true, ...pendingInstall }
    } catch (error) {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
      } catch {
        // ignore
      }
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  function saveInstallerAsLastGood(installerPath, version) {
    if (!installerPath || !fs.existsSync(installerPath) || !isValidSemVer(version)) return null
    try {
      const dest = path.join(rollbackDir, path.basename(installerPath))
      fs.copyFileSync(installerPath, dest)
      return {
        version: String(version),
        installerPath: dest,
        savedAt: new Date().toISOString(),
      }
    } catch {
      return null
    }
  }

  function launchInstaller(installerPath) {
    if (process.platform === 'win32') {
      // NSIS: start detached so updater can exit; installer closes old app and overwrites program files.
      const child = spawn(installerPath, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })
      child.unref()
      return { ok: true, mode: 'nsis-launch' }
    }
    // macOS / others: open DMG for user to drag-replace (program dir); user data untouched.
    return shell.openPath(installerPath).then((err) =>
      err ? { ok: false, error: err, mode: 'open-dmg' } : { ok: true, mode: 'open-dmg' },
    )
  }

  async function installUpdate() {
    const state = loadState()
    const pending = state.pendingInstall
    if (!pending?.installerPath || !fs.existsSync(pending.installerPath)) {
      return { ok: false, error: '请先下载更新包' }
    }

    // Keep existing lastGood (previous successful version installer) for rollback if this apply fails.
    writeJson(path.join(updatesRoot, 'pending-apply.json'), {
      targetVersion: pending.version,
      fromVersion: readPackageVersion(),
      startedAt: new Date().toISOString(),
    })

    saveState({
      pendingInstall: { ...pending, applyStartedAt: new Date().toISOString() },
    })

    const launched = await launchInstaller(pending.installerPath)
    if (!launched.ok) return launched

    // Exit so Windows NSIS can replace files (overwrite install). User data stays in userData.
    if (process.platform === 'win32') {
      setTimeout(() => {
        app.quit()
      }, 400)
    }
    return {
      ok: true,
      message: '已启动安装程序。升级会替换程序文件并保留用户数据。',
      canRollback: Boolean(state.lastGood?.installerPath && fs.existsSync(state.lastGood.installerPath)),
      ...launched,
      targetVersion: pending.version,
    }
  }

  async function rollback() {
    const state = loadState()
    const good = state.lastGood
    if (!good?.installerPath || !fs.existsSync(good.installerPath)) {
      return { ok: false, error: '没有可回滚的安装包' }
    }
    writeJson(path.join(updatesRoot, 'pending-apply.json'), {
      targetVersion: good.version,
      fromVersion: readPackageVersion(),
      rollback: true,
      startedAt: new Date().toISOString(),
    })
    const launched = await launchInstaller(good.installerPath)
    if (!launched.ok) return launched
    if (process.platform === 'win32') {
      setTimeout(() => app.quit(), 400)
    }
    return {
      ok: true,
      message: `正在回滚到 ${good.version}`,
      version: good.version,
      ...launched,
    }
  }

  /** Call on startup: clear pending marker if version reached target; else keep rollback available. */
  function finalizePendingOnLaunch() {
    const markerPath = path.join(updatesRoot, 'pending-apply.json')
    const marker = readJson(markerPath, null)
    if (!marker) return { ok: true, pending: false }
    const current = readPackageVersion()
    const reached = marker.targetVersion && compareSemVer(current, marker.targetVersion) === 0
    try {
      fs.unlinkSync(markerPath)
    } catch {
      // ignore
    }
    if (reached) {
      const state = loadState()
      const nextGood =
        saveInstallerAsLastGood(state.pendingInstall?.installerPath, current) || state.lastGood
      saveState({ lastGood: nextGood || null, pendingInstall: null })
      return { ok: true, pending: false, applied: true, version: current }
    }
    return {
      ok: true,
      pending: true,
      applied: false,
      expected: marker.targetVersion,
      current,
      canRollback: Boolean(loadState().lastGood?.installerPath),
      message: marker.rollback
        ? '回滚可能未完成'
        : `更新可能未完成（期望 ${marker.targetVersion}，当前 ${current}）`,
    }
  }

  return {
    getVersionInfo,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    rollback,
    setFeedUrl,
    resolveFeedUrl,
    finalizePendingOnLaunch,
    updatesRoot,
  }
}

module.exports = { createAppUpdater, platformKey }
