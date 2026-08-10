import { HeroSearch } from '@/components/hub/HeroSearch'
import { AgentStatusCenter } from '@/components/hub/AgentStatusCenter'
import { RecommendSkills } from '@/components/hub/RecommendSkills'

/** Dashboard — Nexus AI 能力中心. */
export function HubHomePage() {
  return (
    <div className="hub-home ws-page">
      <div className="hub-home-glow hub-home-glow-a" />
      <div className="hub-home-glow hub-home-glow-b" />
      <main className="hub-main">
        <HeroSearch />
        <AgentStatusCenter />
        <RecommendSkills />
      </main>
    </div>
  )
}
