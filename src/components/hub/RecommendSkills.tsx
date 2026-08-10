import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SkillCard } from '@/components/skill/SkillCard'
import { skillHotScore } from '@/services/skill-analytics'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import type { Skill } from '@/types'

type RecTab = 'hot' | 'favorite' | 'latest'

const TABS: Array<{ id: RecTab; label: string; icon: string }> = [
  { id: 'hot', label: '热门', icon: '🔥' },
  { id: 'favorite', label: '高收藏', icon: '⭐' },
  { id: 'latest', label: '最新', icon: '🆕' },
]

function catalogSkills(skills: Skill[]) {
  return skills.filter((s) => s.origin !== 'created' && s.origin !== 'imported')
}

/** Recommended capabilities — replaces multi-stat dashboards on home. */
export function RecommendSkills() {
  const skills = useAppStore((s) => s.skills)
  const [tab, setTab] = useState<RecTab>('hot')

  const list = useMemo(() => {
    const base = catalogSkills(skills)
    if (tab === 'latest') {
      return [...base]
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
        .slice(0, 6)
    }
    if (tab === 'favorite') {
      return [...base]
        .sort(
          (a, b) =>
            (b.favoriteCount ?? (b.favorite ? 1 : 0)) - (a.favoriteCount ?? (a.favorite ? 1 : 0)) ||
            skillHotScore(b) - skillHotScore(a),
        )
        .slice(0, 6)
    }
    return [...base]
      .sort(
        (a, b) =>
          skillHotScore(b) - skillHotScore(a) ||
          (b.installCount ?? b.downloads ?? 0) - (a.installCount ?? a.downloads ?? 0),
      )
      .slice(0, 6)
  }, [skills, tab])

  return (
    <section className="hub-section">
      <div className="hub-section-head">
        <div>
          <h2 className="hub-section-title">推荐能力</h2>
          <p className="hub-section-sub">围绕当前工作流的热门、高收藏与最新 Skill</p>
        </div>
        <Link to="/skills/discover" className="hub-link">
          发现更多 →
        </Link>
      </div>

      <div className="hub-rec-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn('hub-rec-tab', tab === item.id && 'is-active')}
            onClick={() => setTab(item.id)}
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {list.length ? (
        <div className="hub-skill-grid">
          {list.map((skill) => (
            <SkillCard key={skill.uid} skill={skill} />
          ))}
        </div>
      ) : (
        <div className="hub-empty">
          <p>暂无推荐。首次启动会自动同步 Skill 索引。</p>
          <Link to="/settings/sources" className="hub-link">
            去技能来源 →
          </Link>
        </div>
      )}
    </section>
  )
}
