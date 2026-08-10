import { Search, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/stores/app-store'
import { searchSkillIndex } from '@/services/skill-index'
import type { Skill } from '@/types'

function matchLocal(skills: Skill[], q: string): Skill[] {
  const needle = q.toLowerCase()
  return skills.filter(
    (s) =>
      s.origin !== 'created' &&
      s.origin !== 'imported' &&
      (s.name.toLowerCase().includes(needle) ||
        s.description.toLowerCase().includes(needle) ||
        s.author?.toLowerCase().includes(needle) ||
        s.category?.toLowerCase().includes(needle) ||
        s.tags.some((t) => t.toLowerCase().includes(needle))),
  )
}

/** Dashboard command-center search — opens Skill Drawer, never leaves home. */
export function HeroSearch() {
  const skills = useAppStore((s) => s.skills)
  const openSkill = useAppStore((s) => s.openSkill)
  const indexInitializing = useAppStore((s) => s.indexInitializing)
  const indexReady = useAppStore((s) => s.indexReady)
  const catalogSyncMessage = useAppStore((s) => s.catalogSyncMessage)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [indexHits, setIndexHits] = useState<Skill[] | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 180)
    return () => window.clearTimeout(t)
  }, [query])

  useEffect(() => {
    let cancelled = false
    if (!debounced) {
      setIndexHits(null)
      return
    }
    void (async () => {
      const hits = await searchSkillIndex(debounced, 8)
      if (!cancelled) setIndexHits(hits)
    })()
    return () => {
      cancelled = true
    }
  }, [debounced])

  const suggestions = useMemo(() => {
    if (!debounced) return [] as Skill[]
    const local = matchLocal(skills, debounced)
    const byUid = new Map<string, Skill>()
    for (const s of [...(indexHits || []), ...local]) {
      const live = skills.find((x) => x.uid === s.uid)
      byUid.set(s.uid, live || s)
    }
    return Array.from(byUid.values()).slice(0, 8)
  }, [skills, debounced, indexHits])

  return (
    <section className="hub-hero">
      <p className="hub-hero-kicker">Nexus AI 能力中心</p>
      <h1 className="hub-hero-title">探索和管理你的 Agent Skills</h1>
      <p className="hub-hero-sub">连接多个 Skill 来源，一键同步到你的 Agent</p>

      <div className="hub-search-wrap">
        <div className="hub-search">
          <Search className="hub-search-icon" />
          <input
            className="hub-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && suggestions[0]) openSkill(suggestions[0].uid)
            }}
            placeholder="按名称、描述、标签、作者搜索…"
            aria-label="搜索技能"
            disabled={indexInitializing && !indexReady}
          />
          {indexInitializing ? (
            <span className="hub-search-status">
              <Loader2 className="h-4 w-4 animate-spin" />
              初始化中
            </span>
          ) : (
            <button
              type="button"
              className="hub-search-btn"
              onClick={() => {
                if (suggestions[0]) openSkill(suggestions[0].uid)
              }}
            >
              搜索
            </button>
          )}
        </div>

        {indexInitializing ? (
          <div className="hub-index-banner">
            <Loader2 className="h-4 w-4 animate-spin" />
            <div>
              <div className="font-medium">正在初始化 Skill 库</div>
              <div className="text-xs opacity-80">{catalogSyncMessage || '同步技能来源…'}</div>
            </div>
          </div>
        ) : null}

        {suggestions.length > 0 ? (
          <ul className="hub-search-suggest">
            {suggestions.map((skill) => (
              <li key={skill.uid}>
                <button
                  type="button"
                  onClick={() => openSkill(skill.uid)}
                >
                  <span className="name">{skill.name}</span>
                  <span className="meta">
                    {skill.sourceName}
                    {skill.author ? ` · ${skill.author}` : ''} · v{skill.latestVersion || skill.version}
                  </span>
                  {skill.description ? <span className="desc">{skill.description}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : debounced && !indexInitializing ? (
          <div className="hub-search-empty">未找到匹配的 Skill</div>
        ) : null}
      </div>
    </section>
  )
}
