import { CheckCircle2, FolderOpen, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import type { TaskStatus } from '@/types'

export function TasksPage() {
  const tasks = useAppStore((s) => s.tasks)
  const retryTask = useAppStore((s) => s.retryTask)
  const cancelTask = useAppStore((s) => s.cancelTask)
  const highlightTaskId = useAppStore((s) => s.highlightTaskId)
  const setHighlightTaskId = useAppStore((s) => s.setHighlightTaskId)
  const logsDirDisplay = useAppStore((s) => s.logsDirDisplay)
  const logsTodayFileDisplay = useAppStore((s) => s.logsTodayFileDisplay)
  const logsRetainDays = useAppStore((s) => s.logsRetainDays)
  const refreshLogsInfo = useAppStore((s) => s.refreshLogsInfo)
  const openLogsDirectory = useAppStore((s) => s.openLogsDirectory)
  const [params] = useSearchParams()
  const refs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    void refreshLogsInfo()
  }, [refreshLogsInfo])

  useEffect(() => {
    const fromQuery = params.get('task')
    const target = fromQuery || highlightTaskId
    if (!target) return
    const el = refs.current[target]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    const timer = window.setTimeout(() => setHighlightTaskId(null), 2500)
    return () => window.clearTimeout(timer)
  }, [params, highlightTaskId, tasks, setHighlightTaskId])

  return (
    <div className="mx-auto max-w-[860px] space-y-4">
      <div>
        <h1 className="text-xl font-semibold">任务日志</h1>
        <p className="mt-1 text-sm text-mesh-dim">下载、安装、更新、导入、同步、取消同步与发布任务统一在此追踪</p>
      </div>

      <div className="rounded-mesh border border-mesh-border bg-mesh-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">运行日志存放路径</div>
            <p className="mt-1 text-xs text-mesh-dim">
              按天生成日志文件（以日期命名），保留最近 {logsRetainDays || 7} 天，便于排查故障
            </p>
            <div className="mt-2 break-all font-mono text-xs text-mesh-muted">
              {logsDirDisplay || '加载中…'}
            </div>
            {logsTodayFileDisplay ? (
              <div className="mt-1 break-all font-mono text-[11px] text-mesh-dim">
                今日文件：{logsTodayFileDisplay}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-mesh border border-mesh-border px-3 py-2 text-xs hover:bg-mesh-panel"
            onClick={() => void openLogsDirectory()}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            打开日志目录
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {tasks.map((task) => {
          const active = (params.get('task') || highlightTaskId) === task.id
          return (
            <div
              key={task.id}
              id={`task-${task.id}`}
              ref={(node) => {
                refs.current[task.id] = node
              }}
              className={cn(
                'rounded-mesh border bg-mesh-card p-4 transition-colors',
                active ? 'border-mesh-accent ring-2 ring-mesh-accent/40' : 'border-mesh-border',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <StatusIcon status={task.status} />
                  <div>
                    <div className="font-medium">{task.title}</div>
                    <div className="mt-2 space-y-1 text-xs text-mesh-muted">
                      {task.kindLabel ? <TaskMetaRow label="类型" value={task.kindLabel} /> : null}
                      {task.skillName ? <TaskMetaRow label="Skill" value={task.skillName} /> : null}
                      {task.sourceName ? <TaskMetaRow label="来源" value={task.sourceName} /> : null}
                      {task.sizeLabel ? <TaskMetaRow label="大小" value={task.sizeLabel} /> : null}
                      {task.agentName ? <TaskMetaRow label="智能体" value={task.agentName} /> : null}
                      <TaskMetaRow label="时间" value={new Date(task.createdAt).toLocaleString('zh-CN', { hour12: false })} />
                      {task.subtitle ? <div className="pt-1 text-[11px] leading-5 text-mesh-dim">{task.subtitle}</div> : null}
                    </div>
                    {task.error ? <div className="mt-2 text-xs text-mesh-danger">{task.error}</div> : null}
                    {typeof task.progress === 'number' && (task.status === 'running' || task.status === 'pending') ? (
                      <div className="mt-3">
                        <div className="mb-1 text-[11px] text-mesh-dim">{task.progress}%</div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-mesh-panel">
                          <div className="h-full rounded-full bg-mesh-accent transition-all" style={{ width: `${task.progress}%` }} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {task.status === 'failed' ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-mesh-border px-2.5 py-1.5 text-xs hover:bg-mesh-panel"
                      onClick={() => retryTask(task.id)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> 重试
                    </button>
                  ) : null}
                  {task.status === 'running' || task.status === 'pending' ? (
                    <button
                      type="button"
                      className="rounded-md border border-mesh-border px-2.5 py-1.5 text-xs text-mesh-dim hover:bg-mesh-panel"
                      onClick={() => cancelTask(task.id)}
                    >
                      取消
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
        {!tasks.length ? <div className="py-16 text-center text-sm text-mesh-dim">暂无任务</div> : null}
      </div>
    </div>
  )
}

function TaskMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-mesh-dim">{label}</span>
      <span className="text-mesh-text">{value}</span>
    </div>
  )
}

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === 'success') return <CheckCircle2 className="mt-0.5 h-5 w-5 text-mesh-success" />
  if (status === 'failed') return <XCircle className="mt-0.5 h-5 w-5 text-mesh-danger" />
  if (status === 'cancelled') return <XCircle className="mt-0.5 h-5 w-5 text-mesh-dim" />
  return <Loader2 className={cn('mt-0.5 h-5 w-5 text-mesh-accent', status === 'running' && 'animate-spin')} />
}
