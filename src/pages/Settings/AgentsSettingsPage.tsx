import { ExternalLink, FolderCog, FolderOpen, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import type { AgentInstallation } from '@/types'

async function openExternalUrl(url: string) {
  const api = window.skillMesh?.shell?.openExternal
  if (api) {
    const result = await api(url)
    if (!result.ok) useAppStore.getState().showToast(result.error || '打开失败', 'error')
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

function AgentPathEditor({
  agent,
  onClose,
}: {
  agent: AgentInstallation
  onClose: () => void
}) {
  const agentPathOverrides = useAppStore((s) => s.agentPathOverrides)
  const saveAgentPathOverride = useAppStore((s) => s.saveAgentPathOverride)
  const validateAgentSkillPath = useAppStore((s) => s.validateAgentSkillPath)
  const [draft, setDraft] = useState(
    () => agentPathOverrides[agent.id] || agent.defaultSkillPath || agent.skillPath || '',
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)

  const runValidate = async (value: string) => {
    setChecking(true)
    try {
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
    } finally {
      setChecking(false)
    }
  }

  const pickFolder = () => {
    void (async () => {
      const picked = await window.skillMesh?.dialog.openDirectory({
        title: `选择 ${agent.name} Skill 保存目录`,
        defaultPath: draft || agent.defaultSkillPath,
      })
      if (!picked) return
      setDraft(picked)
      void runValidate(picked)
    })()
  }

  return (
    <div className="mt-3 rounded-mesh border border-mesh-accent/30 bg-mesh-accentSoft/20 p-3">
      <div className="mb-2 text-xs font-medium text-mesh-text">修改 Skill 保存路径</div>
      <div className="flex gap-2">
        <div
          className={cn(
            'min-w-0 flex-1 rounded-mesh border bg-mesh-panel px-3 py-2 font-mono text-xs text-mesh-muted',
            error ? 'border-mesh-danger' : 'border-mesh-border',
          )}
          title={draft || '请选择文件夹'}
        >
          <span className="block truncate">{draft || '请选择文件夹'}</span>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-mesh border border-mesh-border px-2.5 py-1.5 text-xs hover:bg-mesh-panel"
          onClick={pickFolder}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          选择文件夹
        </button>
      </div>
      {agent.defaultSkillPath ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-mesh-dim">
          <span className="min-w-0 truncate">默认：{agent.defaultSkillPath}</span>
          <button
            type="button"
            className="shrink-0 text-mesh-accent hover:underline"
            onClick={() => {
              setDraft(agent.defaultSkillPath || '')
              setError(null)
            }}
          >
            恢复默认
          </button>
        </div>
      ) : null}
      {error ? <div className="mt-2 text-xs text-mesh-danger">{error}</div> : null}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-mesh border border-mesh-border px-3 py-1.5 text-xs"
          onClick={onClose}
          disabled={saving}
        >
          取消
        </button>
        <button
          type="button"
          disabled={saving || checking || !draft.trim()}
          className="rounded-mesh bg-mesh-accent px-3 py-1.5 text-xs text-white disabled:opacity-50"
          onClick={() => {
            void (async () => {
              setSaving(true)
              try {
                const ok = await runValidate(draft)
                if (!ok) return
                const result = await saveAgentPathOverride(agent.id, draft)
                if (result.ok) onClose()
                else if (result.message) setError(result.message)
              } finally {
                setSaving(false)
              }
            })()
          }}
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}

export function AgentsSettingsPage() {
  const agents = useAppStore((s) => s.agents)
  const scanAgents = useAppStore((s) => s.scanAgents)
  const agentPathOverrides = useAppStore((s) => s.agentPathOverrides)
  const restartRequired = useAppStore((s) => s.restartRequired)
  const defaultSyncAgentIds = useAppStore((s) => s.defaultSyncAgentIds)
  const toggleDefaultSyncAgent = useAppStore((s) => s.toggleDefaultSyncAgent)
  const [scanning, setScanning] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const sortedAgents = useMemo(
    () =>
      [...agents].sort((a, b) => {
        if (a.installed === b.installed) return a.name.localeCompare(b.name, 'zh')
        return a.installed ? -1 : 1
      }),
    [agents],
  )
  const detectedCount = useMemo(() => agents.filter((a) => a.installed).length, [agents])

  return (
    <div className="mx-auto max-w-[860px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">智能体配置</h1>
          <p className="mt-1 text-sm text-mesh-dim">
            发现本机智能体；已安装的可查看程序目录与 Skill 保存目录。勾选「安装 Skill 后自动同步至智能体」后，新安装的
            Skill 会自动写入对应目录。
          </p>
        </div>
        <button
          type="button"
          disabled={scanning}
          className="inline-flex items-center gap-1.5 rounded-mesh border border-mesh-border px-3 py-2 text-sm hover:bg-mesh-card disabled:opacity-50"
          onClick={() => {
            setScanning(true)
            void scanAgents().finally(() => setScanning(false))
          }}
        >
          <RefreshCw className={cn('h-4 w-4', scanning && 'animate-spin')} />
          重新扫描
        </button>
      </div>

      {restartRequired ? (
        <div className="rounded-mesh border border-mesh-warning/40 bg-mesh-warning/10 px-4 py-3 text-sm text-mesh-warning">
          路径已修改，重启应用后生效。可稍后手动重启。
          <button
            type="button"
            className="ml-3 rounded-md bg-mesh-warning px-2.5 py-1 text-xs font-medium text-black"
            onClick={() => void window.skillMesh?.app.relaunch()}
          >
            立即重启
          </button>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="text-sm text-mesh-muted">已发现智能体 · {detectedCount} 个可用</div>
        {sortedAgents.map((agent) => (
          <div key={agent.id} className="rounded-mesh border border-mesh-border bg-mesh-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="inline-flex flex-wrap items-center gap-2 font-medium">
                  <span
                    className={cn(
                      'h-2.5 w-2.5 shrink-0 rounded-full',
                      agent.installed ? 'bg-mesh-success' : 'bg-mesh-dim',
                    )}
                  />
                  <span>{agent.name}</span>
                  {agent.version ? (
                    <span className="rounded-md bg-mesh-panel px-1.5 py-0.5 font-mono text-[11px] font-normal text-mesh-muted">
                      v{agent.version}
                    </span>
                  ) : null}
                </div>
                {agent.installed ? (
                  <div className="mt-2 space-y-1.5 text-[11px]">
                    <div>
                      <div className="text-mesh-dim">程序安装目录</div>
                      <div className="mt-0.5 break-all font-mono text-mesh-muted">
                        {agent.installPath || agent.executablePath || '未定位到可执行文件（通过配置目录发现）'}
                      </div>
                    </div>
                    <div>
                      <div className="text-mesh-dim">Skill 保存目录</div>
                      <div className="mt-0.5 break-all font-mono text-mesh-muted">
                        {agent.skillPath || agent.defaultSkillPath || '-'}
                      </div>
                      {agentPathOverrides[agent.id] ? (
                        <div className="mt-0.5 text-mesh-warning">已自定义路径（重启后生效）</div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    <div className="text-xs text-mesh-dim">未检测到该智能体</div>
                    {agent.homepageUrl ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-mesh-accent hover:underline"
                        onClick={() => void openExternalUrl(agent.homepageUrl!)}
                      >
                        <ExternalLink className="h-3 w-3" />
                        打开官网
                        <span className="font-mono text-[11px] text-mesh-dim">{agent.homepageUrl}</span>
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="flex min-w-0 max-w-full shrink-0 flex-col items-stretch gap-2 sm:items-end">
                <div className="text-right text-xs text-mesh-muted">{agent.installed ? '可用' : '未安装'}</div>
                {agent.installed ? (
                  <>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-1 rounded-mesh border border-mesh-border px-2.5 py-1 text-[11px] text-mesh-muted hover:bg-mesh-panel hover:text-mesh-text"
                      onClick={() => setEditingId((id) => (id === agent.id ? null : agent.id))}
                    >
                      <FolderCog className="h-3.5 w-3.5" />
                      {editingId === agent.id ? '收起' : '修改 Skill 保存路径'}
                    </button>
                    <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap text-[11px] text-mesh-muted">
                      <input
                        type="checkbox"
                        checked={defaultSyncAgentIds.includes(agent.id)}
                        onChange={() => toggleDefaultSyncAgent(agent.id)}
                        className="shrink-0 rounded border-mesh-border"
                      />
                      <span>安装 Skill 后自动同步至智能体</span>
                    </label>
                  </>
                ) : null}
              </div>
            </div>
            {agent.installed && editingId === agent.id ? (
              <AgentPathEditor agent={agent} onClose={() => setEditingId(null)} />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
