import { useEffect, useState } from 'react'
import { Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Local brand icons from /icon (copied to /public/agents).
 * Filename mapping:
 *   Cursor.png → cursor
 *   Claude Code.png → claude-code
 *   CodeX.png → codex
 *   Trae.png → trae
 *   Qoder.png → qoder
 *   PiAgent.png → piagent
 *   OpenCode.png → opencode
 */
const LOGO_SRC: Record<string, string[]> = {
  cursor: ['/agents/cursor.png'],
  'claude-code': ['/agents/claude-code.png'],
  codex: ['/agents/codex.png'],
  trae: ['/agents/trae.png'],
  qoder: ['/agents/qoder.png'],
  piagent: ['/agents/piagent.png'],
  opencode: ['/agents/opencode.png'],
}

export function AgentLogo({
  agentId,
  className,
}: {
  agentId: string
  className?: string
}) {
  const sources = LOGO_SRC[agentId] || []
  const [srcIndex, setSrcIndex] = useState(0)

  useEffect(() => {
    setSrcIndex(0)
  }, [agentId])

  const exhausted = srcIndex >= sources.length
  const src = !exhausted ? sources[srcIndex] : null

  if (!src) {
    return (
      <span className={cn('agent-logo agent-logo-fallback', className)} aria-hidden>
        <Bot className="h-[55%] w-[55%]" />
      </span>
    )
  }

  return (
    <span className={cn('agent-logo', className)} aria-hidden>
      <img
        key={`${agentId}-${src}`}
        className="agent-logo-img"
        src={src}
        alt=""
        draggable={false}
        onError={() => setSrcIndex((i) => i + 1)}
      />
    </span>
  )
}
