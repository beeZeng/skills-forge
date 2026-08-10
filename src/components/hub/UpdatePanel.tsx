import { useMemo } from 'react'
import { useAppStore } from '@/stores/app-store'

export function UpdatePanel() {
  const skills = useAppStore((s) => s.skills)
  const updateAll = useAppStore((s) => s.updateAll)
  const updateSkill = useAppStore((s) => s.updateSkill)
  const openSkill = useAppStore((s) => s.openSkill)

  const updates = useMemo(() => skills.filter((s) => s.updateAvailable), [skills])

  if (!updates.length) return null

  return (
    <section className="hub-section hub-updates">
      <div className="hub-section-head">
        <div>
          <h2 className="hub-section-title">技能更新</h2>
          <p className="hub-section-sub">{updates.length} 个技能可升级</p>
        </div>
        <button type="button" className="hub-update-all" onClick={() => updateAll()}>
          全部更新
        </button>
      </div>

      <ul className="hub-update-list">
        {updates.slice(0, 6).map((skill) => (
          <li key={skill.uid}>
            <button type="button" className="hub-update-item" onClick={() => openSkill(skill.uid)}>
              <span className="name">{skill.name}</span>
              <span className="ver">
                {skill.version} → {skill.latestVersion || skill.version}
              </span>
            </button>
            <button type="button" className="hub-update-one" onClick={() => updateSkill(skill.uid)}>
              更新
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
