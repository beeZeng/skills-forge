import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { HubSkillCard } from './HubSkillCard'
import { skillHotScore } from '@/services/skill-analytics'
import { useAppStore } from '@/stores/app-store'

export function TrendingSkills() {
  const skills = useAppStore((s) => s.skills)
  const installSkill = useAppStore((s) => s.installSkill)
  const openSkill = useAppStore((s) => s.openSkill)
  const showToast = useAppStore((s) => s.showToast)

  const trending = useMemo(() => {
    return [...skills]
      .filter((s) => s.origin !== 'created' && s.origin !== 'imported')
      .sort(
        (a, b) =>
          skillHotScore(b) - skillHotScore(a) ||
          (b.installCount ?? b.downloads ?? 0) - (a.installCount ?? a.downloads ?? 0) ||
          (b.updatedAt || '').localeCompare(a.updatedAt || ''),
      )
      .slice(0, 6)
  }, [skills])
  return (
    <section className="hub-section">
      <div className="hub-section-head">
        <div>
          <h2 className="hub-section-title">热门技能</h2>
          <p className="hub-section-sub">可一键部署到本地智能体的热门能力</p>
        </div>
        <Link to="/skills/discover" className="hub-link">
          发现更多 →
        </Link>
      </div>

      {trending.length ? (
        <div className="hub-skill-grid">
          {trending.map((skill) => (
            <HubSkillCard
              key={skill.uid}
              skill={skill}
              onOpen={openSkill}
              onDeploy={(uid) => {
                installSkill(uid)
                showToast('正在部署技能', 'success')
              }}
            />
          ))}
        </div>
      ) : (
        <div className="hub-empty">
          <p>暂无热门技能。请先在「技能来源」刷新目录。</p>
          <Link to="/settings/sources" className="hub-link">
            去技能来源 →
          </Link>
        </div>
      )}
    </section>
  )
}
