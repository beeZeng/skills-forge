import { FolderOpen, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'

const DEFAULT_SKILLS_ROOT = '~/.skillmesh'

export function StorageSettingsPage() {
  const used = useAppStore((s) => s.storageUsedGb)
  const total = useAppStore((s) => s.storageTotalGb)
  const free = useAppStore((s) => s.storageFreeGb)
  const skillsUsed = useAppStore((s) => s.storageSkillsUsedGb)
  const volumeLabel = useAppStore((s) => s.storageVolumeLabel)
  const installed = useAppStore((s) => s.skills.filter((s) => s.installed).length)
  const clearStorageCache = useAppStore((s) => s.clearStorageCache)
  const refreshStorageStats = useAppStore((s) => s.refreshStorageStats)
  const skillsRootPath = useAppStore((s) => s.skillsRootPath)
  const saveSkillsRootPath = useAppStore((s) => s.saveSkillsRootPath)
  const refreshSkillsRootPath = useAppStore((s) => s.refreshSkillsRootPath)
  const validateAgentSkillPath = useAppStore((s) => s.validateAgentSkillPath)
  const restartRequired = useAppStore((s) => s.restartRequired)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(skillsRootPath || DEFAULT_SKILLS_ROOT)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [absolutePath, setAbsolutePath] = useState<string | null>(null)
  const [refreshingDisk, setRefreshingDisk] = useState(false)

  useEffect(() => {
    void refreshSkillsRootPath()
  }, [refreshSkillsRootPath])

  useEffect(() => {
    void refreshStorageStats()
  }, [refreshStorageStats, skillsRootPath, restartRequired])

  useEffect(() => {
    if (!editing) setDraft(skillsRootPath || DEFAULT_SKILLS_ROOT)
  }, [skillsRootPath, editing])

  useEffect(() => {
    const api = window.skillMesh?.app?.getPaths
    if (!api) return
    void api().then((res) => {
      if (res?.ok && res.skillsRoot) setAbsolutePath(res.skillsRoot)
    })
  }, [skillsRootPath, restartRequired])

  const runValidate = async (value: string) => {
    const result = await validateAgentSkillPath(value)
    if (!result.ok) {
      setError(result.error || '路径不合法')
      return false
    }
    setError(null)
    if (result.displayPath || result.path) {
      setDraft(result.displayPath || result.path || value)
    }
    return true
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-4">
      <div>
        <h1 className="text-xl font-semibold">存储管理</h1>
        <p className="mt-1 text-sm text-mesh-dim">管理本机 Skill 仓库占用与根目录位置</p>
      </div>

      {restartRequired ? (
        <div className="rounded-mesh border border-mesh-warning/40 bg-mesh-warning/10 px-4 py-3 text-sm text-mesh-warning">
          有路径修改待生效，请重启应用。
          <button
            type="button"
            className="ml-3 rounded-md bg-mesh-warning px-2.5 py-1 text-xs font-medium text-black"
            onClick={() => void window.skillMesh?.app.relaunch()}
          >
            立即重启
          </button>
        </div>
      ) : null}

      <div className="rounded-mesh border border-mesh-border bg-mesh-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">本地仓库路径</div>
            <p className="mt-1 text-xs text-mesh-dim">
              安装 / 新建 / 导入的 Skill 存放于此。修改后需重启生效；已安装内容不会自动迁移。
            </p>
            <div className="mt-2 break-all font-mono text-xs text-mesh-muted">
              {skillsRootPath || DEFAULT_SKILLS_ROOT}
            </div>
            {absolutePath ? (
              <div className="mt-1 break-all font-mono text-[11px] text-mesh-dim">{absolutePath}</div>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              className="rounded-md border border-mesh-border px-2.5 py-1 text-xs hover:bg-mesh-panel"
              onClick={() => {
                void (async () => {
                  const target = absolutePath
                  if (!target || !window.skillMesh?.shell?.openPath) {
                    useAppStore.getState().showToast('无法打开目录', 'warning')
                    return
                  }
                  const result = await window.skillMesh.shell.openPath(target)
                  if (!result.ok) useAppStore.getState().showToast(result.error || '打开失败', 'error')
                })()
              }}
            >
              <span className="inline-flex items-center gap-1">
                <FolderOpen className="h-3.5 w-3.5" />
                打开
              </span>
            </button>
            <button
              type="button"
              className="rounded-md border border-mesh-border px-2.5 py-1 text-xs hover:bg-mesh-panel"
              onClick={() => {
                setEditing((v) => !v)
                setError(null)
                setDraft(skillsRootPath || DEFAULT_SKILLS_ROOT)
              }}
            >
              {editing ? '收起' : '修改路径'}
            </button>
          </div>
        </div>

        {editing ? (
          <div className="mt-4 rounded-mesh border border-mesh-accent/30 bg-mesh-accentSoft/20 p-3">
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setError(null)
                }}
                onBlur={() => {
                  if (draft.trim()) void runValidate(draft)
                }}
                className={cn(
                  'min-w-0 flex-1 rounded-mesh border bg-mesh-panel px-3 py-2 font-mono text-xs outline-none focus:border-mesh-accent',
                  error ? 'border-mesh-danger' : 'border-mesh-border',
                )}
                placeholder={DEFAULT_SKILLS_ROOT}
                spellCheck={false}
              />
              <button
                type="button"
                className="shrink-0 rounded-mesh border border-mesh-border px-2.5 py-1.5 text-xs hover:bg-mesh-panel"
                onClick={() => {
                  void (async () => {
                    const picked = await window.skillMesh?.dialog.openDirectory({
                      title: '选择本地 Skill 仓库目录',
                      defaultPath: draft,
                    })
                    if (picked) {
                      setDraft(picked)
                      void runValidate(picked)
                    }
                  })()
                }}
              >
                浏览
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-mesh-dim">
              <span>默认：{DEFAULT_SKILLS_ROOT}</span>
              <button
                type="button"
                className="text-mesh-accent hover:underline"
                onClick={() => {
                  setDraft(DEFAULT_SKILLS_ROOT)
                  setError(null)
                }}
              >
                恢复默认
              </button>
            </div>
            {error ? <div className="mt-2 text-xs text-mesh-danger">{error}</div> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-mesh border border-mesh-border px-3 py-1.5 text-xs"
                disabled={saving}
                onClick={() => {
                  setEditing(false)
                  setError(null)
                }}
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-mesh bg-mesh-accent px-3 py-1.5 text-xs text-white disabled:opacity-50"
                onClick={() => {
                  void (async () => {
                    setSaving(true)
                    try {
                      const ok = await runValidate(draft)
                      if (!ok) return
                      const result = await saveSkillsRootPath(draft)
                      if (result.ok) setEditing(false)
                      else if (result.message) setError(result.message)
                    } finally {
                      setSaving(false)
                    }
                  })()
                }}
              >
                {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-mesh border border-mesh-border bg-mesh-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">仓库所在磁盘</div>
            <p className="mt-1 text-xs text-mesh-dim">
              按当前 Skill 保存目录所在盘符统计总容量与剩余空间
              {volumeLabel ? `（${volumeLabel}）` : ''}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-mesh-border px-2.5 py-1 text-xs hover:bg-mesh-panel"
            disabled={refreshingDisk}
            onClick={() => {
              setRefreshingDisk(true)
              void refreshStorageStats().finally(() => setRefreshingDisk(false))
            }}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshingDisk && 'animate-spin')} />
            刷新
          </button>
        </div>

        <div className="mt-4 flex justify-between text-sm">
          <span>已用 / 总容量</span>
          <span className="font-mono">
            {total > 0 ? `${used} GB / ${total} GB` : '—'}
          </span>
        </div>
        <div className="mt-1 flex justify-between text-xs text-mesh-dim">
          <span>剩余可用</span>
          <span className="font-mono">{total > 0 ? `${free} GB` : '—'}</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-mesh-panel">
          <div
            className="h-full rounded-full bg-mesh-accent transition-all"
            style={{ width: `${total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-mesh bg-mesh-panel p-3">
            <div className="text-mesh-dim">已安装 Skill</div>
            <div className="mt-1 text-lg font-semibold">{installed}</div>
          </div>
          <div className="rounded-mesh bg-mesh-panel p-3">
            <div className="text-mesh-dim">仓库占用</div>
            <div className="mt-1 text-lg font-semibold">{skillsUsed > 0 ? `${skillsUsed} GB` : '< 0.1 GB'}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 rounded-mesh bg-mesh-panel px-3 py-2 text-xs text-mesh-dim">
          <span>清理过期运行日志（保留最近 7 天）</span>
          <button
            type="button"
            onClick={clearStorageCache}
            className="rounded-md border border-mesh-border px-2.5 py-1 text-xs text-mesh-muted hover:bg-mesh-card hover:text-mesh-text"
          >
            清理
          </button>
        </div>
      </div>
    </div>
  )
}
