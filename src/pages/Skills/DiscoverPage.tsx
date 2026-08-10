import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CatalogRefreshButton, CatalogSyncBar } from '@/components/CatalogSyncBar'
import { SkillCard } from '@/components/skill/SkillCard'
import { CATEGORY_CHIPS, selectFilteredSkills, useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import type { DiscoverTab, SkillInstallFilter, SkillSort } from '@/types'

const TABS: Array<{ id: DiscoverTab; label: string }> = [
  { id: 'recommended', label: '推荐' },
  { id: 'latest', label: '最新' },
  { id: 'hot', label: '热门' },
  { id: 'favorites', label: '收藏' },
]

export function DiscoverPage() {
  const skills = useAppStore(useShallow(selectFilteredSkills))
  const sources = useAppStore((s) => s.sources)
  const discoverTab = useAppStore((s) => s.discoverTab)
  const setDiscoverTab = useAppStore((s) => s.setDiscoverTab)
  const sourceFilter = useAppStore((s) => s.sourceFilter)
  const setSourceFilter = useAppStore((s) => s.setSourceFilter)
  const categoryFilter = useAppStore((s) => s.categoryFilter)
  const setCategoryFilter = useAppStore((s) => s.setCategoryFilter)
  const statusFilter = useAppStore((s) => s.statusFilter)
  const setStatusFilter = useAppStore((s) => s.setStatusFilter)
  const sortBy = useAppStore((s) => s.sortBy)
  const setSortBy = useAppStore((s) => s.setSortBy)
  const updateAll = useAppStore((s) => s.updateAll)
  const batchMode = useAppStore((s) => s.batchMode)
  const setBatchMode = useAppStore((s) => s.setBatchMode)
  const selectedUids = useAppStore((s) => s.selectedUids)
  const installSelected = useAppStore((s) => s.installSelected)
  const updateSelected = useAppStore((s) => s.updateSelected)
  const clearSelection = useAppStore((s) => s.clearSelection)
  const refreshCatalog = useAppStore((s) => s.refreshCatalog)
  const ensureCatalogFresh = useAppStore((s) => s.ensureCatalogFresh)
  const resetDiscoverFilters = useAppStore((s) => s.resetDiscoverFilters)
  const catalogSyncing = useAppStore((s) => s.catalogSyncing)
  const catalogSyncMessage = useAppStore((s) => s.catalogSyncMessage)
  const lastCatalogSyncedAt = useAppStore((s) => s.lastCatalogSyncedAt)
  const updateCount = useAppStore((s) => s.skills.reduce((n, x) => n + (x.updateAvailable ? 1 : 0), 0))
  const enabledSources = sources.filter((s) => s.id !== 'local' && s.enabled)
  const connectedSources = enabledSources.filter((s) => s.status === 'connected')

  useEffect(() => {
    if ((discoverTab as string) === 'import') setDiscoverTab('recommended')
  }, [discoverTab, setDiscoverTab])

  useEffect(() => {
    // Prefer cache; only refresh when stale (or never refreshed)
    void ensureCatalogFresh().catch(() => undefined)
  }, [ensureCatalogFresh])

  const neverSynced = !lastCatalogSyncedAt
  const emptyHint = (() => {
    if (!enabledSources.length) {
      return {
        title: '还没有可用的技能平台',
        desc: '请先在「技能源配置」中添加并启用平台，再刷新列表。',
        cta: { to: '/settings/sources', label: '去技能源配置' },
      }
    }
    if (neverSynced) {
      return {
        title: '尚未拉取技能列表',
        desc: '首次启动不会自动拉取。请点击「刷新列表」，从已启用的技能源同步 Skill。',
        cta: null,
      }
    }
    if (!connectedSources.length) {
      return {
        title: '技能平台尚未连接',
        desc: catalogSyncMessage || '请在「技能源配置」中测试连接并刷新列表。',
        cta: { to: '/settings/sources', label: '去技能源配置' },
      }
    }
    if (sourceFilter !== 'all' || categoryFilter !== '全部' || statusFilter !== 'all' || discoverTab === 'favorites') {
      return {
        title: '没有匹配的 Skill',
        desc: '当前筛选条件过窄，可重置筛选后再试。',
        cta: null,
      }
    }
    return {
      title: '技能列表为空',
      desc: catalogSyncMessage || '可点击「刷新列表」从已连接源拉取。',
      cta: null,
    }
  })()

  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">发现</h1>
          <p className="mt-1 text-sm text-mesh-dim">
            {catalogSyncMessage ||
              (lastCatalogSyncedAt
                ? `从已连接技能源发现 Skill · 上次刷新 ${new Date(lastCatalogSyncedAt).toLocaleString()}`
                : '从已连接的技能源发现并安装 Skill')}
          </p>
        </div>
        <div className="flex gap-2">
          <CatalogRefreshButton
            busy={catalogSyncing}
            onClick={() => void refreshCatalog({ force: true })}
          />
          <button
            type="button"
            disabled={catalogSyncing}
            onClick={() => setBatchMode(!batchMode)}
            className="rounded-mesh border border-mesh-border px-3 py-1.5 text-xs text-mesh-muted hover:bg-mesh-card disabled:pointer-events-none disabled:opacity-50"
          >
            {batchMode ? '退出批量' : '批量管理'}
          </button>
        </div>
      </div>

      <CatalogSyncBar active={catalogSyncing} message={catalogSyncMessage} />

      {neverSynced && !catalogSyncing ? (
        <div className="rounded-mesh border border-mesh-accent/35 bg-mesh-accentSoft/40 px-4 py-3 text-sm">
          <div className="font-medium text-mesh-text">首次启动需手动刷新列表</div>
          <p className="mt-1 text-xs text-mesh-dim">
            首次使用不会自动拉取技能。请点击右上角「刷新列表」，从已启用的技能源同步 Skill 后再浏览与安装。
          </p>
        </div>
      ) : null}

      <div
        className={cn(
          'flex flex-wrap gap-1 rounded-mesh border border-mesh-border bg-mesh-panel p-1',
          catalogSyncing && 'pointer-events-none opacity-60',
        )}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            disabled={catalogSyncing}
            onClick={() => setDiscoverTab(tab.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              discoverTab === tab.id ? 'bg-mesh-accentSoft text-mesh-text' : 'text-mesh-muted hover:text-mesh-text',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className={cn(
          'flex flex-wrap items-center gap-2',
          catalogSyncing && 'pointer-events-none opacity-60',
        )}
      >
        <select
          value={sourceFilter}
          disabled={catalogSyncing}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-mesh border border-mesh-border bg-mesh-card px-2.5 py-1.5 text-xs disabled:opacity-60"
        >
          <option value="all">全部来源</option>
          {sources
            .filter((s) => s.id !== 'local')
            .map((s) => (
              <option key={s.id} value={s.id} disabled={!s.enabled}>
                {s.name}
                {!s.enabled ? '（已禁用）' : ''}
              </option>
            ))}
        </select>
        <select
          value={categoryFilter}
          disabled={catalogSyncing}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-mesh border border-mesh-border bg-mesh-card px-2.5 py-1.5 text-xs disabled:opacity-60"
        >
          {CATEGORY_CHIPS.map((c) => (
            <option key={c} value={c}>
              {c === '全部' ? '全部分类' : c}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          disabled={catalogSyncing}
          onChange={(e) => setStatusFilter(e.target.value as SkillInstallFilter)}
          className="rounded-mesh border border-mesh-border bg-mesh-card px-2.5 py-1.5 text-xs disabled:opacity-60"
        >
          <option value="all">状态：全部</option>
          <option value="not_installed">未安装</option>
          <option value="installed">已安装</option>
          <option value="update_available">有更新</option>
        </select>
        <select
          value={sortBy}
          disabled={catalogSyncing}
          onChange={(e) => setSortBy(e.target.value as SkillSort)}
          className="rounded-mesh border border-mesh-border bg-mesh-card px-2.5 py-1.5 text-xs disabled:opacity-60"
        >
          <option value="recommended">排序：推荐</option>
          <option value="latest">最新</option>
          <option value="hot">热门</option>
          <option value="name">名称</option>
        </select>
        <button
          type="button"
          disabled={catalogSyncing}
          onClick={resetDiscoverFilters}
          className="rounded-mesh border border-mesh-border px-2.5 py-1.5 text-xs text-mesh-muted hover:bg-mesh-card disabled:pointer-events-none disabled:opacity-50"
        >
          重置筛选
        </button>
      </div>

      {updateCount > 0 ? (
        <div className="flex items-center justify-between rounded-mesh border border-mesh-warning/30 bg-mesh-warning/10 px-4 py-3 text-sm">
          <span>发现 {updateCount} 个 Skill 可更新</span>
          <button
            type="button"
            disabled={catalogSyncing}
            onClick={() => void updateAll()}
            className="rounded-md bg-mesh-warning px-3 py-1.5 text-xs font-medium text-black hover:bg-mesh-warning/90 disabled:pointer-events-none disabled:opacity-50"
          >
            全部更新
          </button>
        </div>
      ) : null}

      <div className="relative">
        {catalogSyncing ? (
          <div className="absolute inset-0 z-10 flex items-start justify-center rounded-mesh bg-mesh-bg/55 pt-16 backdrop-blur-[1px]">
            <div className="inline-flex items-center gap-2 rounded-mesh border border-mesh-border bg-mesh-panel px-4 py-2 text-sm text-mesh-muted shadow-mesh">
              <Loader2 className="h-4 w-4 animate-spin text-mesh-accent" />
              正在加载技能列表…
            </div>
          </div>
        ) : null}
        <div
          className={cn(
            'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3',
            catalogSyncing && 'pointer-events-none opacity-50',
          )}
        >
          {skills.map((skill) => (
            <SkillCard key={skill.uid} skill={skill} />
          ))}
        </div>
        {!skills.length ? (
          <div className="rounded-mesh border border-dashed border-mesh-border py-16 text-center">
            {catalogSyncing ? (
              <>
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-mesh-accent" />
                <div className="mt-3 text-sm text-mesh-muted">正在刷新技能列表…</div>
                <p className="mx-auto mt-2 max-w-md text-xs text-mesh-dim">请稍候，刷新完成前无法重复操作</p>
              </>
            ) : (
              <>
                <div className="text-sm text-mesh-muted">{emptyHint.title}</div>
                <p className="mx-auto mt-2 max-w-md text-xs text-mesh-dim">{emptyHint.desc}</p>
                <div className="mt-4 flex justify-center gap-2">
                  {emptyHint.cta ? (
                    <Link
                      to={emptyHint.cta.to}
                      className="rounded-mesh bg-mesh-accent px-3 py-1.5 text-xs text-white hover:bg-mesh-accent/90"
                    >
                      {emptyHint.cta.label}
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={resetDiscoverFilters}
                    className="rounded-mesh border border-mesh-border px-3 py-1.5 text-xs text-mesh-muted hover:bg-mesh-card"
                  >
                    重置筛选
                  </button>
                  <CatalogRefreshButton
                    busy={catalogSyncing}
                    onClick={() => void refreshCatalog({ force: true })}
                  />
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>

      {batchMode ? (
        <div className="sticky bottom-4 z-20 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-mesh border border-mesh-border bg-mesh-panel/95 px-4 py-3 shadow-mesh backdrop-blur">
          <span className="text-sm text-mesh-muted">已选 {selectedUids.length} 项</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-mesh-border px-2.5 py-1.5 text-xs"
              onClick={clearSelection}
            >
              清空
            </button>
            <button
              type="button"
              disabled={!selectedUids.length}
              className="rounded-md bg-mesh-accent px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
              onClick={installSelected}
            >
              批量安装
            </button>
            <button
              type="button"
              disabled={!selectedUids.length}
              className="rounded-md bg-mesh-warning px-2.5 py-1.5 text-xs text-black disabled:opacity-50"
              onClick={updateSelected}
            >
              批量更新
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
