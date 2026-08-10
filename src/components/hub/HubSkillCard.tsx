import { useState } from 'react'
import type { Skill } from '@/types'
import { cn } from '@/lib/utils'

type Props = {
  skill: Skill
  onDeploy: (uid: string) => void
  onOpen: (uid: string) => void
}

export function HubSkillCard({ skill, onDeploy, onOpen }: Props) {
  const [deploying, setDeploying] = useState(false)
  const [activated, setActivated] = useState(false)

  const handleDeploy = () => {
    if (skill.installed || deploying) {
      onOpen(skill.uid)
      return
    }
    setDeploying(true)
    onDeploy(skill.uid)
    window.setTimeout(() => {
      setDeploying(false)
      setActivated(true)
      window.setTimeout(() => setActivated(false), 1600)
    }, 900)
  }

  return (
    <article className={cn('hub-skill-card', activated && 'is-activated')}>
      <button type="button" className="hub-skill-card-body" onClick={() => onOpen(skill.uid)}>
        <div className="hub-skill-icon">{skill.name.slice(0, 1)}</div>
        <h3 className="hub-skill-name">{skill.name}</h3>
        <p className="hub-skill-desc">{skill.description || '暂无描述'}</p>
        <div className="hub-skill-meta">
          <span>v{skill.latestVersion || skill.version}</span>
          <span>{skill.sourceName}</span>
        </div>
      </button>
      <button
        type="button"
        className={cn('hub-deploy-btn', skill.installed && 'is-installed', deploying && 'is-deploying')}
        onClick={handleDeploy}
        disabled={deploying}
      >
        {activated ? '已激活' : skill.installed ? '已安装' : deploying ? '部署中…' : '部署'}
      </button>
    </article>
  )
}
