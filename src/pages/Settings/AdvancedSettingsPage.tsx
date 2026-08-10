import { useEffect, useState } from 'react'
import { PathReveal } from '@/components/common/PathReveal'
import { PageHeader } from '@/components/layout/PageHeader'
import { AppVersionPanel } from '@/components/settings/AppVersionPanel'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import type { AppTheme } from '@/types'

const THEMES: Array<{ id: AppTheme; label: string; desc: string; swatch: string; recommend?: boolean }> = [
  {
    id: 'deepspace',
    label: '深空蓝紫',
    desc: 'AI 控制中心 · OpenAI / Linear / Raycast',
    swatch: 'linear-gradient(135deg,#080B16,#0F172A 45%,#6366F1 78%,#8B5CF6)',
    recommend: true,
  },
  {
    id: 'futurewhite',
    label: '未来白',
    desc: '专业 AI 工作台 · Apple / Notion / Claude',
    swatch: 'linear-gradient(135deg,#F8FAFC,#FFFFFF 55%,#2563EB)',
  },
  {
    id: 'obsidian',
    label: '黑曜石电蓝',
    desc: 'AI Runtime · 开发者工具感最强',
    swatch: 'linear-gradient(135deg,#050505,#111111 50%,#3B82F6 78%,#00E5FF)',
  },
  {
    id: 'aurora',
    label: 'Aurora 极光',
    desc: '下一代 AI 产品 · 渐变光晕与玻璃感',
    swatch: 'linear-gradient(135deg,#0B1020,#2563EB 40%,#9333EA 70%,#06B6D4)',
  },
  {
    id: 'verdant',
    label: '墨绿科技',
    desc: 'AI + 数据中心 · 差异化绿调',
    swatch: 'linear-gradient(135deg,#071A16,#0F2922 50%,#10B981 78%,#22D3EE)',
  },
  {
    id: 'system',
    label: '跟随系统',
    desc: '浅色跟随未来白 · 深色跟随深空蓝紫',
    swatch: 'linear-gradient(135deg,#F8FAFC 0 50%,#080B16 50% 100%)',
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
      <PageHeader description="主题与应用配置" />

      <AppVersionPanel />

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
                  {item.recommend ? (
                    <span className="rounded px-1 py-0.5 text-[10px] font-medium tracking-wide text-mesh-accent ring-1 ring-mesh-accent/40">
                      推荐
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
                  <div className="mt-1.5">
                    <PathReveal label="配置目录" path={paths?.dataRootDisplay || paths?.dataRoot} />
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
