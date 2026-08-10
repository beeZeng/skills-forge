import { FilePlus2, FolderOpen, Plus, RefreshCw, Search, Trash2, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { PathReveal } from '@/components/common/PathReveal'
import { StatusBadge } from '@/components/common/StatusBadge'
import { PageHeader } from '@/components/layout/PageHeader'
import { selectMineSkills, useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import type { MineTab } from '@/types'

const TABS: Array<{ id: MineTab; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'mine', label: '本地创建与导入' },
  { id: 'hub', label: '来自源的已安装' },
]

export function MinePage() {
  const skills = useAppStore(useShallow(selectMineSkills))
  const agents = useAppStore((s) => s.agents)
  const openSkill = useAppStore((s) => s.openSkill)
  const updateSkill = useAppStore((s) => s.updateSkill)
  const deleteSkill = useAppStore((s) => s.deleteSkill)
  const openSkillDirectory = useAppStore((s) => s.openSkillDirectory)
  const mineTab = useAppStore((s) => s.mineTab)
  const setMineTab = useAppStore((s) => s.setMineTab)
  const folder = useAppStore((s) => s.newSkillsFolder)
  const setNewSkillsFolder = useAppStore((s) => s.setNewSkillsFolder)
  const createSkill = useAppStore((s) => s.createSkill)
  const importLocalSkill = useAppStore((s) => s.importLocalSkill)
  const installedSearchQuery = useAppStore((s) => s.installedSearchQuery)
  const setInstalledSearchQuery = useAppStore((s) => s.setInstalledSearchQuery)

  const [entryOpen, setEntryOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')

  const stats = useMemo(() => {
    const installed = skills.length
    const updatable = skills.filter((s) => s.updateAvailable).length
    const abnormal = skills.filter(
      (s) =>
        s.installed &&
        !s.updateAvailable &&
        ((s.origin !== 'created' && s.origin !== 'imported' && !s.localPath && !s.agentInstallPath) ||
          (s.syncedAgents.length > 0 && !s.agentInstallPath)),
    ).length
    return { installed, updatable, abnormal }
  }, [skills])

  const defaultMd = useMemo(
    () => `# 未命名 Skill\n\n## 简介\n\n描述这个 Skill 的用途。\n\n## 使用方式\n\n1. 步骤一\n2. 步骤二\n`,
    [],
  )

  const openCreateFile = () => {
    setEntryOpen(false)
    setName('')
    setContent(defaultMd)
    setEditorOpen(true)
  }

  const openLocalImport = () => {
    setEntryOpen(false)
    void (async () => {
      const filePath = (await window.skillMesh?.dialog.openSkillPackage()) || null
      if (filePath) importLocalSkill(filePath)
    })()
  }

  return (
    <div className="space-y-4">
      {!editorOpen ? (
        <>
          <PageHeader
            description="管理本地 Agent 能力"
            actions={
              <>
                <div className="flex w-full max-w-xs items-center gap-2 rounded-xl border border-mesh-border bg-mesh-panel px-3 py-2 sm:w-64">
                  <Search className="h-4 w-4 shrink-0 text-mesh-dim" />
                  <input
                    value={installedSearchQuery}
                    onChange={(e) => setInstalledSearchQuery(e.target.value)}
                    placeholder="搜索已安装技能"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-mesh-dim"
                  />
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-mesh-accent px-3 py-2 text-sm text-white hover:bg-mesh-accent/90"
                  onClick={() => setEntryOpen(true)}
                >
                  <Plus className="h-4 w-4" /> 新建
                </button>
              </>
            }
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="ws-card px-4 py-3">
              <div className="text-xs text-mesh-dim">已安装</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-mesh-text">{stats.installed}</div>
            </div>
            <div className="ws-card px-4 py-3">
              <div className="text-xs text-mesh-dim">可更新</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-mesh-warning">{stats.updatable}</div>
            </div>
            <div className="ws-card px-4 py-3">
              <div className="text-xs text-mesh-dim">异常</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-mesh-danger">{stats.abnormal}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-mesh border border-mesh-border bg-mesh-card p-3">
            <PathReveal label="本地技能目录" path={folder} className="min-w-0 flex-1" />
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-mesh-border px-2.5 py-1.5 text-xs hover:bg-mesh-panel"
              onClick={() => {
                void (async () => {
                  const picked = await window.skillMesh?.dialog.openDirectory({
                    title: '选择新建 Skill 保存目录',
                  })
                  if (picked) setNewSkillsFolder(picked)
                })()
              }}
            >
              <FolderOpen className="h-3.5 w-3.5" /> 修改目录
            </button>
          </div>

          <div className="flex flex-wrap gap-1 rounded-mesh border border-mesh-border bg-mesh-panel p-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMineTab(tab.id)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  mineTab === tab.id ? 'bg-mesh-accentSoft text-mesh-text' : 'text-mesh-muted hover:text-mesh-text',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {skills.map((skill) => {
              const hasSync = skill.syncedAgents.length > 0
              const isLocal = skill.origin === 'created' || skill.origin === 'imported'
              return (
                <div
                  key={skill.uid}
                  className="ws-card flex cursor-pointer items-start gap-4 p-4"
                  onClick={() => openSkill(skill.uid)}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mesh-accentSoft font-semibold text-mesh-accent">
                    {skill.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{skill.name}</h3>
                      <span className="font-mono text-xs text-mesh-dim">v{skill.version}</span>
                      <StatusBadge
                        label={
                          skill.origin === 'created' ? '新建' : skill.origin === 'imported' ? '本地导入' : '来自源'
                        }
                        tone="neutral"
                      />
                      <span className="text-xs text-mesh-dim">
                        {skill.sourceName}
                        {skill.namespace ? ` · ${skill.namespace}/${skill.skillId}` : ''}
                      </span>
                      {!isLocal ? (
                        <StatusBadge
                          label={skill.updateAvailable ? '可更新' : '已安装'}
                          tone={skill.updateAvailable ? 'warning' : 'success'}
                        />
                      ) : (
                        <StatusBadge label="正常" tone="success" />
                      )}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-mesh-muted">{skill.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {skill.syncedAgents.length ? (
                        skill.syncedAgents.map((id) => {
                          const agent = agents.find((a) => a.id === id)
                          return (
                            <span key={id} className="rounded-md bg-mesh-accentSoft px-1.5 py-0.5 text-[11px] text-mesh-accent">
                              {agent?.name || id}
                            </span>
                          )
                        })
                      ) : (
                        <span className="text-[11px] text-mesh-dim">尚未同步到任何智能体</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {skill.updateAvailable ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md bg-mesh-warning px-2.5 py-1.5 text-xs font-medium text-black"
                        onClick={() => updateSkill(skill.uid)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> 更新
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-md border border-mesh-border px-2.5 py-1.5 text-xs hover:bg-mesh-panel"
                      onClick={() => openSkill(skill.uid)}
                    >
                      管理同步
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-mesh-border p-1.5 hover:bg-mesh-panel"
                      onClick={() => void openSkillDirectory(skill.uid)}
                      title="打开本地目录"
                    >
                      <FolderOpen className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={hasSync}
                      title={hasSync ? '请先取消所有智能体同步后再删除' : '删除本地 Skill'}
                      className={cn(
                        'rounded-md border p-1.5',
                        hasSync
                          ? 'cursor-not-allowed border-mesh-border text-mesh-dim opacity-50'
                          : 'border-mesh-danger/40 text-mesh-danger hover:bg-mesh-danger/10',
                      )}
                      onClick={() => {
                        if (hasSync) return
                        void deleteSkill(skill.uid)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
            {!skills.length ? (
              <div className="rounded-mesh border border-dashed border-mesh-border py-16 text-center text-sm text-mesh-dim">
                暂无内容，点击右上角「新建」开始创建，或去「发现」安装 Skill
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="flex h-[calc(100vh-8rem)] flex-col rounded-mesh border border-mesh-border bg-mesh-card">
          <div className="flex items-center justify-between gap-3 border-b border-mesh-border px-4 py-3">
            <div>
              <h1 className="text-lg font-semibold">创建文件 · Markdown 编辑</h1>
              <p className="text-xs text-mesh-dim">
                将保存到 {folder}（随便写几行即可，保存时会自动补全 frontmatter）
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-mesh border border-mesh-border px-3 py-1.5 text-sm"
                onClick={() => setEditorOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                disabled={!name.trim()}
                className="rounded-mesh bg-mesh-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
                onClick={() => {
                  createSkill({
                    name: name.trim(),
                    description:
                      content
                        .split(/\r?\n/)
                        .map((l) => l.trim())
                        .find((l) => l && !l.startsWith('#') && l !== '---' && !/^description:/i.test(l)) ||
                      '用户新建的 Skill',
                    content,
                  })
                  setEditorOpen(false)
                }}
              >
                保存创建
              </button>
            </div>
          </div>
          <div className="border-b border-mesh-border px-4 py-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Skill 名称"
              className="w-full rounded-mesh border border-mesh-border bg-mesh-panel px-3 py-2 text-sm outline-none focus:border-mesh-accent"
            />
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-sm leading-6 text-mesh-text outline-none"
            spellCheck={false}
          />
        </div>
      )}

      {entryOpen ? (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-mesh border border-mesh-border bg-mesh-panel p-5 shadow-mesh">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">新建</h2>
              <button type="button" className="text-sm text-mesh-dim" onClick={() => setEntryOpen(false)}>
                关闭
              </button>
            </div>
            <div className="grid gap-3">
              <button
                type="button"
                className="flex items-start gap-3 rounded-mesh border border-mesh-border bg-mesh-card px-4 py-4 text-left hover:border-mesh-accent hover:bg-mesh-cardHover"
                onClick={openCreateFile}
              >
                <FilePlus2 className="mt-0.5 h-5 w-5 text-mesh-accent" />
                <span>
                  <span className="block text-sm font-medium">创建文件</span>
                  <span className="mt-1 block text-xs text-mesh-dim">进入 Markdown 文档编辑模式</span>
                </span>
              </button>
              <button
                type="button"
                className="flex items-start gap-3 rounded-mesh border border-mesh-border bg-mesh-card px-4 py-4 text-left hover:border-mesh-accent hover:bg-mesh-cardHover"
                onClick={openLocalImport}
              >
                <Upload className="mt-0.5 h-5 w-5 text-mesh-accent" />
                <span>
                  <span className="block text-sm font-medium">本地导入</span>
                  <span className="mt-1 block text-xs text-mesh-dim">选择本地 Skill 包（zip / 目录 / .md）</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
