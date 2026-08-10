import { useMemo } from 'react'
import { skillHotScore } from '@/services/skill-analytics'
import { useAppStore } from '@/stores/app-store'
import type { Skill } from '@/types'

const POSITIONS = [
  { x: 50, y: 14, delay: '0s', capability: 'RAG' },
  { x: 18, y: 36, delay: '0.35s', capability: 'Coding' },
  { x: 82, y: 36, delay: '0.7s', capability: 'Testing' },
  { x: 22, y: 72, delay: '1.05s', capability: 'Vision' },
  { x: 78, y: 72, delay: '1.4s', capability: 'Automation' },
  { x: 50, y: 88, delay: '1.75s', capability: 'Office' },
] as const

function pickNetworkSkills(skills: Skill[]): Skill[] {
  const installed = skills.filter((s) => s.installed)
  const hot = [...skills]
    .filter((s) => s.origin !== 'created' && s.origin !== 'imported')
    .sort(
      (a, b) =>
        skillHotScore(b) - skillHotScore(a) ||
        (b.installCount ?? b.downloads ?? 0) - (a.installCount ?? a.downloads ?? 0),
    )
  const map = new Map<string, Skill>()
  for (const s of [...installed, ...hot]) {
    if (!map.has(s.uid)) map.set(s.uid, s)
    if (map.size >= 6) break
  }
  return [...map.values()]
}

/** Single capability network: Agent core + surrounding Skill nodes. */
export function AgentNetwork() {
  const skills = useAppStore((s) => s.skills)
  const agents = useAppStore((s) => s.agents)
  const openSkill = useAppStore((s) => s.openSkill)
  const nodes = useMemo(() => pickNetworkSkills(skills), [skills])
  const primary = useMemo(() => agents.find((a) => a.installed) || agents[0], [agents])

  return (
    <section className="hub-section hub-network-section" aria-label="能力网络">
      <div className="hub-section-head">
        <div>
          <h2 className="hub-section-title">能力网络</h2>
          <p className="hub-section-sub">以当前 Agent 为中心的 Skill 能力拓扑</p>
        </div>
      </div>

      <div className="hub-network-stage">
        <svg className="hub-network-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
          {POSITIONS.slice(0, Math.max(nodes.length, 1)).map((pos, i) => (
            <line
              key={i}
              className="hub-network-line"
              x1="50"
              y1="50"
              x2={pos.x}
              y2={pos.y}
              style={{ animationDelay: pos.delay }}
            />
          ))}
        </svg>

        <div className="hub-network-core">
          <div className="hub-network-core-ring" />
          <div className="hub-network-core-label">
            <span>{primary?.installed ? '已连接' : 'Agent'}</span>
            <strong>{primary?.name || '核心'}</strong>
          </div>
        </div>

        {POSITIONS.map((pos, i) => {
          const skill = nodes[i]
          if (!skill) {
            return (
              <div
                key={`empty-${i}`}
                className="hub-network-node is-empty"
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, animationDelay: pos.delay }}
              >
                <span className="hub-network-orb" />
                <span className="hub-network-name">{pos.capability}</span>
              </div>
            )
          }
          return (
            <button
              key={skill.uid}
              type="button"
              className="hub-network-node"
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, animationDelay: pos.delay }}
              onClick={() => openSkill(skill.uid)}
              title={skill.name}
            >
              <span className="hub-network-orb" />
              <span className="hub-network-name">{skill.name}</span>
              <span className="hub-network-cap">{pos.capability}</span>
            </button>
          )
        })}
      </div>
      <p className="hub-network-caption">点击能力节点打开 Skill 详情</p>
    </section>
  )
}
