import { FolderCog, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'

export function AgentsSettingsPage() {
  const agents = useAppStore((s) => s.agents)
  const scanAgents = useAppStore((s) => s.scanAgents)
  const agentPathOverrides = useAppStore((s) => s.agentPathOverrides)
  const saveAgentPathOverrides = useAppStore((s) => s.saveAgentPathOverrides)
  const restartRequired = useAppStore((s) => s.restartRequired)
  const defaultSyncAgentIds = useAppStore((s) => s.defaultSyncAgentIds)
  const toggleDefaultSyncAgent = useAppStore((s) => s.toggleDefaultSyncAgent)
  const [scanning, setScanning] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})

  const openDialog = () => {
    const next: Record<string, string> = {}
    for (const agent of agents) {
      next[agent.id] = agentPathOverrides[agent.id] || agent.defaultSkillPath || agent.skillPath || ''
    }
    setDraft(next)
    setDialogOpen(true)
  }

  const detectedCount = useMemo(() => agents.filter((a) => a.installed).length, [agents])

  return (
    <div className="mx-auto max-w-[860px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">智能体配置</h1>
          <p className="mt-1 text-sm text-mesh-dim">
            发现本机智能体；勾选「安装后默认同步」后，新安装的 Skill 会自动写入对应技能目录
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-mesh border border-mesh-border px-3 py-2 text-sm hover:bg-mesh-card"
            onClick={openDialog}
          >
            <FolderCog className="h-4 w-4" />
            修改路径
          </button>
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
        {agents.map((agent) => (
          <div key={agent.id} className="rounded-mesh border border-mesh-border bg-mesh-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 font-medium">
                  <span className={cn('h-2.5 w-2.5 rounded-full', agent.installed ? 'bg-mesh-success' : 'bg-mesh-dim')} />
                  {agent.name}
                </div>
                {agent.installed ? (
                  <>
                    <div className="mt-1 text-xs text-mesh-dim">
                      {agent.executablePath || '已通过 skill 目录发现'}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-mesh-dim">{agent.skillPath}</div>
                    {agentPathOverrides[agent.id] ? (
                      <div className="mt-1 text-[11px] text-mesh-warning">已自定义路径（重启后生效）</div>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-1 text-xs text-mesh-dim">未检测到该智能体</div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="text-xs text-mesh-muted">{agent.installed ? '可用' : '未安装'}</div>
                {agent.installed ? (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-mesh-muted">
                    <input
                      type="checkbox"
                      checked={defaultSyncAgentIds.includes(agent.id)}
                      onChange={() => toggleDefaultSyncAgent(agent.id)}
                      className="rounded border-mesh-border"
                    />
                    安装后默认同步
                  </label>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {dialogOpen ? (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-mesh border border-mesh-border bg-mesh-panel p-5 shadow-mesh">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">修改智能体 Skill 路径</h2>
                <p className="mt-1 text-xs text-mesh-dim">统一在此配置，保存后需重启生效</p>
              </div>
              <button type="button" className="text-sm text-mesh-dim" onClick={() => setDialogOpen(false)}>
                关闭
              </button>
            </div>
            <div className="space-y-4">
              {agents.map((agent) => (
                <div key={agent.id} className="rounded-mesh border border-mesh-border bg-mesh-card p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{agent.name}</div>
                    <span className={cn('text-xs', agent.installed ? 'text-mesh-success' : 'text-mesh-dim')}>
                      {agent.installed ? '已检测' : '未检测'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={draft[agent.id] || ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [agent.id]: e.target.value }))}
                      className="min-w-0 flex-1 rounded-mesh border border-mesh-border bg-mesh-panel px-3 py-2 font-mono text-xs outline-none focus:border-mesh-accent"
                      placeholder={agent.defaultSkillPath || 'Skill 目录路径'}
                    />
                    <button
                      type="button"
                      className="shrink-0 rounded-mesh border border-mesh-border px-2.5 py-1.5 text-xs hover:bg-mesh-panel"
                      onClick={() => {
                        void (async () => {
                          const picked = await window.skillMesh?.dialog.openDirectory({
                            title: `选择 ${agent.name} Skill 目录`,
                            defaultPath: draft[agent.id],
                          })
                          if (picked) setDraft((d) => ({ ...d, [agent.id]: picked }))
                        })()
                      }}
                    >
                      浏览
                    </button>
                  </div>
                  {agent.defaultSkillPath ? (
                    <div className="mt-1.5 text-[11px] text-mesh-dim">默认：{agent.defaultSkillPath}</div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-mesh border border-mesh-border px-3 py-1.5 text-sm"
                onClick={() => setDialogOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-mesh bg-mesh-accent px-3 py-1.5 text-sm text-white"
                onClick={() => {
                  void (async () => {
                    const cleaned: Record<string, string> = {}
                    for (const agent of agents) {
                      const value = (draft[agent.id] || '').trim()
                      const def = agent.defaultSkillPath || ''
                      if (value && value !== def) cleaned[agent.id] = value
                    }
                    await saveAgentPathOverrides(cleaned)
                    setDialogOpen(false)
                  })()
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
