import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import type { AppTheme } from '@/types'

const THEMES: Array<{ id: AppTheme; label: string; desc: string; swatch: string; experimental?: boolean }> = [
  {
    id: 'system',
    label: '跟随系统',
    desc: '与系统浅色 / 深色同步',
    swatch: 'linear-gradient(135deg,#F4F5F5 0 50%,#111217 50% 100%)',
  },
  {
    id: 'dark',
    label: '深色',
    desc: 'Grafana 默认深色',
    swatch: 'linear-gradient(135deg,#111217,#181B1F 55%,#5794F2)',
  },
  {
    id: 'light',
    label: '浅色',
    desc: 'Grafana 默认浅色',
    swatch: 'linear-gradient(135deg,#F4F5F5,#FFFFFF 55%,#3D71D9)',
  },
  {
    id: 'sapphiredusk',
    label: '蓝暮',
    desc: '深蓝暮色 · 青强调',
    swatch: 'linear-gradient(135deg,#182036,#12192E 50%,#93EBF0)',
    experimental: true,
  },
  {
    id: 'tron',
    label: '霓虹',
    desc: '霓虹青 · 赛博面板',
    swatch: 'linear-gradient(135deg,#0A0F18,#0F1B2A 50%,#00FFFF)',
    experimental: true,
  },
  {
    id: 'gildedgrove',
    label: '金林',
    desc: '墨绿底 · 金强调',
    swatch: 'linear-gradient(135deg,#111614,#1D2220 50%,#FEAC34)',
    experimental: true,
  },
  {
    id: 'gloom',
    label: '幽暗',
    desc: '近黑底 · 琥珀强调',
    swatch: 'linear-gradient(135deg,#000000,#121118 50%,#FF934D)',
    experimental: true,
  },
  {
    id: 'desertbloom',
    label: '沙花',
    desc: '暖沙浅色 · 珊瑚强调',
    swatch: 'linear-gradient(135deg,#FFF8F0,#FFFFFF 50%,#FF6F61)',
    experimental: true,
  },
]

type AppPaths = {
  dataRoot?: string
  dataRootDisplay?: string
}

const PLATFORM_LABEL: Record<string, string> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
}

export function AdvancedSettingsPage() {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const showToast = useAppStore((s) => s.showToast)

  const [paths, setPaths] = useState<AppPaths | null>(null)
  const [busy, setBusy] = useState<'data' | 'relaunch' | 'copy' | null>(null)

  const desktop = !!window.skillMesh
  const versions = window.skillMesh?.versions
  const platformKey = window.skillMesh?.platform || ''
  const platformLabel = PLATFORM_LABEL[platformKey] || platformKey || '未知'

  useEffect(() => {
    const api = window.skillMesh?.app?.getPaths
    if (!api) return
    void api().then((res) => {
      if (res?.ok) setPaths(res)
    })
  }, [])

  const openDataDir = async () => {
    const target = paths?.dataRoot
    if (!target || !window.skillMesh?.shell?.openPath) {
      showToast('无法打开目录', 'warning')
      return
    }
    setBusy('data')
    try {
      const result = await window.skillMesh.shell.openPath(target)
      if (!result.ok) showToast(result.error || '打开失败', 'error')
    } finally {
      setBusy(null)
    }
  }

  const copyPath = async (text?: string) => {
    if (!text) return
    setBusy('copy')
    try {
      await navigator.clipboard.writeText(text)
      showToast('路径已复制', 'success')
    } catch {
      showToast('复制失败', 'error')
    } finally {
      setBusy(null)
    }
  }

  const relaunch = async () => {
    if (!window.skillMesh?.app?.relaunch) {
      showToast('当前环境不支持重启', 'warning')
      return
    }
    const ok = window.skillMesh.dialog?.confirm
      ? await window.skillMesh.dialog.confirm({
          title: '重启 Nexus',
          message: '确定立即重启应用？',
        })
      : window.confirm('确定立即重启应用？')
    if (!ok) return
    setBusy('relaunch')
    try {
      useAppStore.getState().persist()
      await window.skillMesh.app.relaunch()
    } catch {
      setBusy(null)
      showToast('重启失败', 'error')
    }
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-4">
      <div>
        <h1 className="text-xl font-semibold">高级设置</h1>
        <p className="mt-1 text-sm text-mesh-dim">主题与应用配置目录</p>
      </div>

      <section className="space-y-3 rounded-mesh border border-mesh-border bg-mesh-card p-4">
        <div>
          <h2 className="text-sm font-medium">外观</h2>
          <p className="mt-1 text-xs text-mesh-dim">立即生效并保存</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {THEMES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTheme(item.id)}
              className={cn(
                'flex items-center gap-3 rounded-mesh border px-3 py-3 text-left transition-colors',
                theme === item.id
                  ? 'border-mesh-accent bg-mesh-accentSoft'
                  : 'border-mesh-border hover:border-mesh-borderBright hover:bg-mesh-cardHover',
              )}
            >
              <span
                className="h-10 w-10 shrink-0 rounded-lg border border-mesh-border"
                style={{ background: item.swatch }}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="block text-sm font-medium">{item.label}</span>
                  {item.experimental ? (
                    <span className="rounded px-1 py-0.5 text-[10px] font-medium tracking-wide text-mesh-warning ring-1 ring-mesh-warning/40">
                      实验
                    </span>
                  ) : null}
                </span>
                <span className="block text-xs text-mesh-dim">{item.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-mesh border border-mesh-border bg-mesh-card p-4">
        <div>
          <h2 className="text-sm font-medium">配置目录</h2>
          <p className="mt-1 text-xs text-mesh-dim">
            存放账号会话、技能源、主题等界面状态。Skill 文件仓库请到「存储管理」修改。
          </p>
        </div>

        {!desktop ? (
          <p className="text-xs text-mesh-dim">浏览器预览看不到本机路径，请使用桌面客户端。</p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-mesh border border-mesh-border bg-mesh-panel/60 px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">应用配置</div>
                  <div className="mt-0.5 text-xs text-mesh-dim">账号会话、技能源、主题等</div>
                  <div className="mt-1.5 break-all font-mono text-xs text-mesh-muted">
                    {paths?.dataRootDisplay || (paths?.dataRoot ? '…' : '读取中…')}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    disabled={!paths?.dataRootDisplay || busy !== null}
                    onClick={() => void copyPath(paths?.dataRoot || paths?.dataRootDisplay)}
                    className="rounded-md border border-mesh-border px-2.5 py-1 text-xs hover:bg-mesh-card disabled:opacity-50"
                  >
                    复制
                  </button>
                  <button
                    type="button"
                    disabled={!paths?.dataRoot || busy !== null}
                    onClick={() => void openDataDir()}
                    className="rounded-md border border-mesh-border px-2.5 py-1 text-xs hover:bg-mesh-card disabled:opacity-50"
                  >
                    {busy === 'data' ? '打开中…' : '打开'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-mesh-border pt-3 text-xs text-mesh-dim">
              <span>
                {platformLabel}
                {versions?.electron ? ` · Electron ${versions.electron}` : ''}
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void relaunch()}
                className="rounded-mesh border border-mesh-border px-3 py-1.5 text-xs text-mesh-muted hover:bg-mesh-panel disabled:opacity-50"
              >
                {busy === 'relaunch' ? '重启中…' : '重启应用'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
