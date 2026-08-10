import { Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { renderMarkdownToHtml } from '@/lib/markdown'
import type { Skill } from '@/types'

export function SkillMarkdownPreviewModal({
  skill,
  open,
  onClose,
}: {
  skill: Skill | null
  open: boolean
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [fileName, setFileName] = useState('SKILL.md')

  useEffect(() => {
    if (!open || !skill) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setContent('')
    void (async () => {
      try {
        const api = window.skillMesh?.skills?.readMarkdown
        if (!api) {
          // Browser fallback: show in-memory / synthesized markdown
          const fallback =
            skill.content?.trim() ||
            `# ${skill.name}\n\n${skill.description || ''}\n\n- Version: ${skill.version}\n- Source: ${skill.sourceName}\n`
          if (!cancelled) {
            setContent(fallback)
            setFileName('SKILL.md')
          }
          return
        }
        const result = await api({
          localPath: skill.localPath,
          skill: {
            skillId: skill.skillId,
            name: skill.name,
            description: skill.description,
            version: skill.version,
            sourceId: skill.sourceId,
            sourceName: skill.sourceName,
            namespace: skill.namespace,
            localPath: skill.localPath,
            content: skill.content,
          },
        })
        if (cancelled) return
        if (!result.ok || !result.content) {
          setError(result.error || '无法读取 Markdown 内容')
          return
        }
        setContent(result.content)
        setFileName(result.fileName || 'SKILL.md')
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '预览失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, skill])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const html = useMemo(() => (content ? renderMarkdownToHtml(content) : ''), [content])

  if (!open || !skill) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4">
      <button type="button" aria-label="关闭预览" className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${skill.name} Markdown 预览`}
        className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-mesh border border-mesh-border bg-mesh-panel shadow-mesh"
      >
        <div className="flex items-start justify-between gap-3 border-b border-mesh-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{skill.name}</h2>
            <p className="mt-0.5 text-xs text-mesh-dim">
              {fileName} · Markdown 预览
              {skill.localPath ? ` · ${skill.localPath}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-mesh-dim hover:bg-mesh-card hover:text-mesh-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-mesh-muted">
              <Loader2 className="h-5 w-5 animate-spin text-mesh-accent" />
              正在加载文档…
            </div>
          ) : error ? (
            <div className="rounded-mesh border border-mesh-danger/40 bg-mesh-danger/10 px-4 py-3 text-sm text-mesh-danger">
              {error}
            </div>
          ) : (
            <div
              className="skill-md-preview text-sm leading-relaxed text-mesh-muted"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
