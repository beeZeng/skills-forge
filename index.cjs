const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { registerIpc } = require('./ipc/register.cjs')

if (!process.versions.electron) {
  console.error('请使用 Electron 启动：npm run dev')
  process.exit(1)
}

const isDev = !app.isPackaged
let mainWindow = null

function resolveAppPath(...segments) {
  return path.join(app.getAppPath(), ...segments)
}

function getPreloadPath() {
  return resolveAppPath('electron', 'preload', 'index.cjs')
}

/** Prefer asar.unpacked dist (electron-builder asarUnpack), fall back to asar path. */
function getDistIndexPath() {
  const asarIndex = resolveAppPath('dist', 'index.html')
  const unpackedIndex = asarIndex.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
  if (unpackedIndex !== asarIndex && fs.existsSync(unpackedIndex)) return unpackedIndex
  return asarIndex
}

function showLoadError(mainWindow, message) {
  const html = `<!doctype html><html><body style="margin:0;background:#0f1115;color:#e8ecf4;font-family:sans-serif;padding:40px"><h1>Nexus 启动失败</h1><p>${message}</p></body></html>`
  void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: 'Nexus',
    backgroundColor: '#0F1115',
    show: true,
    center: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.setTitle('Nexus')

  mainWindow.webContents.on('console-message', (_event, _level, message) => {
    console.log('[Nexus renderer]', message)
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[Nexus] page load failed', { code, desc, url })
    showLoadError(mainWindow, `${desc} (${code})`)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Nexus] render process gone', details)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'
  if (isDev) {
    console.log('[Nexus] loading', devUrl)
    const target = `${devUrl.replace(/\/$/, '')}/#/dashboard`
    void mainWindow
      .loadURL(target)
      .then(() => {
        mainWindow?.show()
        mainWindow?.focus()
        if (app.dock) app.dock.show()
      })
      .catch((error) => {
        console.error('[Nexus] loadURL failed', error)
        showLoadError(mainWindow, '无法连接开发服务器 5173，请先运行 npm run dev')
      })
    return
  }

  const indexPath = getDistIndexPath()
  console.log('[Nexus] loading production UI from', indexPath)
  if (!fs.existsSync(indexPath)) {
    showLoadError(mainWindow, `缺少前端资源：${indexPath}`)
    return
  }

  // Use loadFile (file://) — custom app:// often fails to serve Vite ES modules (black screen)
  void mainWindow
    .loadFile(indexPath, { hash: '/dashboard' })
    .then(() => {
      mainWindow?.show()
      mainWindow?.focus()
      if (app.dock) app.dock.show()
    })
    .catch((error) => {
      console.error('[Nexus] production load failed', error)
      showLoadError(mainWindow, String(error?.message || error))
    })
}

app.setName('Nexus')

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    try {
      const iconPath = resolveAppPath('public', 'icon.png')
      if (fs.existsSync(iconPath)) app.dock.setIcon(iconPath)
      app.dock.show()
    } catch (error) {
      console.warn('[Nexus] dock icon skipped', error)
    }
  }

  const dataRoot = path.join(app.getPath('userData'), 'skillmesh-data')
  fs.mkdirSync(dataRoot, { recursive: true })
  registerIpc({ dataRoot, homeDir: os.homedir() })
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  } else {
    mainWindow?.show()
    mainWindow?.focus()
  }
})

ipcMain.handle('dialog:openSkillPackage', async () => {
  const result = await dialog.showOpenDialog({
    title: '导入本地 Skill',
    properties: ['openFile', 'openDirectory'],
    filters: [
      { name: 'Skill Packages', extensions: ['zip', 'skillpack', 'tar', 'gz', 'tgz'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
})

ipcMain.handle('shell:openPath', async (_event, targetPath) => {
  if (typeof targetPath !== 'string' || !targetPath) return { ok: false }
  const err = await shell.openPath(targetPath)
  return { ok: !err, error: err || undefined }
})

ipcMain.handle('app:focus', async () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    app.focus({ steal: true })
  }
  return { ok: true }
})
