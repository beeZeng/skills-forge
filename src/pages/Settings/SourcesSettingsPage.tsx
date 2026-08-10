import { useMemo, useState } from 'react'
import { CatalogRefreshButton, CatalogSyncBar } from '@/components/CatalogSyncBar'
import { PageHeader } from '@/components/layout/PageHeader'
import { PANGU_HUB_SOURCE_ID } from '@/constants/pangu'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import type { SkillSource } from '@/types'

export function SourcesSettingsPage() {
  const allSources = useAppStore((s) => s.sources)
  const account = useAppStore((s) => s.account)
  const sources = useMemo(
    () =>
      allSources.filter((s) => {
        if (s.id === 'local' || s.type === 'offline') return false
        // Pangu Hub only after login + 一键连接
        if ((s.id === PANGU_HUB_SOURCE_ID || s.accountBound) && !account?.loggedIn) return false
        return true
      }),
    [allSources, account?.loggedIn],
  )
  const addSource = useAppStore((s) => s.addSource)
  const updateSource = useAppStore((s) => s.updateSource)
  const removeSource = useAppStore((s) => s.removeSource)
  const testSource = useAppStore((s) => s.testSource)
  const refreshCatalog = useAppStore((s) => s.refreshCatalog)
  const retryFailedSources = useAppStore((s) => s.retryFailedSources)
  const catalogSyncing = useAppStore((s) => s.catalogSyncing)
  const catalogSyncMessage = useAppStore((s) => s.catalogSyncMessage)
  const lastCatalogSyncedAt = useAppStore((s) => s.lastCatalogSyncedAt)
  const discoveredHub = useAppStore((s) => s.discoveredHub)
  const connectDiscoveredHub = useAppStore((s) => s.connectDiscoveredHub)
  const discoverPanguHub = useAppStore((s) => s.discoverPanguHub)
  const setLoginOpen = useAppStore((s) => s.setLoginOpen)
  const allSkills = useAppStore((s) => s.skills)
  const skillCountBySource = useMemo(() => {
    const map = new Map<string, number>()
    for (const skill of allSkills) {
      if (skill.origin === 'created' || skill.origin === 'imported') continue
      map.set(skill.sourceId, (map.get(skill.sourceId) || 0) + 1)
    }
    return map
  }, [allSkills])
  const failedSourceCount = useMemo(
    () => sources.filter((s) => s.enabled && !!s.lastSyncError).length,
    [sources],
  )
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SkillSource | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [form, setForm] = useState({ name: '', registryUrl: '', token: '', type: 'custom' as SkillSource['type'] })

  const showDiscoverCard =
    !!account?.loggedIn &&
    !!discoveredHub &&
    !discoveredHub.connected &&
    (discoveredHub.namespaces?.length ?? 0) > 0

  const openCreate = () => {
    setEditing(null)
    setForm({
      name: '本地 SkillHub',
      registryUrl: 'http://localhost:8080',
      token: '',
      type: 'custom',
    })
    setOpen(true)
  }

  const openEdit = (source: SkillSource) => {
    setEditing(source)
    setForm({
      name: source.name,
      registryUrl: source.registryUrl || '',
      token: source.token || '',
      type: source.type,
    })
    setOpen(true)
  }

  return (
    <div className="mx-auto max-w-[860px] space-y-4">
      <PageHeader
        description="管理 Skill Provider · 登录后可一键连接盘古 Hub"
        actions={
          <>
            {failedSourceCount > 0 ? (
              <button
                type="button"
                disabled={catalogSyncing}
                onClick={() => void retryFailedSources()}
                className="rounded-mesh border border-mesh-danger/40 px-3 py-2 text-sm text-mesh-danger hover:bg-mesh-card disabled:pointer-events-none disabled:opacity-50"
              >
                {catalogSyncing ? '刷新中…' : `重试失败源（${failedSourceCount}）`}
              </button>
            ) : null}
            <CatalogRefreshButton
              busy={catalogSyncing}
              size="md"
              label="立即同步"
              busyLabel="同步中…"
              onClick={() => void refreshCatalog({ force: true })}
            />
            <button
              type="button"
              disabled={catalogSyncing}
              onClick={openCreate}
              className="rounded-mesh bg-mesh-accent px-3 py-2 text-sm text-white disabled:pointer-events-none disabled:opacity-50"
            >
              + 添加源
            </button>
          </>
        }
      />

      <CatalogSyncBar active={catalogSyncing} message={catalogSyncMessage} />

      {!lastCatalogSyncedAt && !catalogSyncing ? (
        <div className="rounded-mesh border border-mesh-accent/35 bg-mesh-accentSoft/40 px-4 py-3 text-sm">
          <div className="font-medium text-mesh-text">Skill 索引尚未建立</div>
          <p className="mt-1 text-xs text-mesh-dim">
            首页启动时会自动同步；也可在此点击「立即同步」手动拉取。
          </p>
        </div>
      ) : null}

      {catalogSyncMessage && !catalogSyncing ? (
        <div className="rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2 text-xs text-mesh-muted">
          {catalogSyncMessage}
        </div>
      ) : null}

      {!account?.loggedIn ? (
        <div className="rounded-mesh border border-dashed border-mesh-border bg-mesh-card/60 px-4 py-3 text-sm">
          <div className="font-medium">未登录</div>
          <p className="mt-1 text-xs text-mesh-dim">
            当前为游客模式，可浏览公共 Skill。登录后可检测并连接盘古 Hub。
          </p>
          <button
            type="button"
            className="mt-3 rounded-mesh bg-mesh-accent px-3 py-1.5 text-xs text-white"
            onClick={() => setLoginOpen(true)}
          >
            登录 SkillHub
          </button>
        </div>
      ) : null}

      {showDiscoverCard ? (
        <div className="rounded-mesh border border-mesh-accent/40 bg-mesh-accentSoft/30 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">检测到 {discoveredHub.name}</div>
              <div className="mt-1 text-xs text-mesh-dim">{discoveredHub.baseUrl}</div>
              <div className="mt-2 text-xs text-mesh-muted">
                账号在该 Hub 下有 {discoveredHub.namespaces?.length ?? 0} 个命名空间权限（连接后仍为单个技能源）
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(discoveredHub.namespaces ?? []).slice(0, 8).map((ns) => (
                  <span
                    key={ns.slug}
                    className="rounded bg-mesh-panel px-1.5 py-0.5 text-[10px] text-mesh-dim"
                    title={ns.role}
                  >
                    @{ns.slug}
                  </span>
                ))}
                {(discoveredHub.namespaces?.length ?? 0) > 8 ? (
                  <span className="text-[10px] text-mesh-dim">
                    +{(discoveredHub.namespaces?.length ?? 0) - 8}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={catalogSyncing}
                className="rounded-mesh border border-mesh-border px-3 py-1.5 text-xs disabled:pointer-events-none disabled:opacity-50"
                onClick={() => void discoverPanguHub()}
              >
                重新检测
              </button>
              <button
                type="button"
                disabled={connecting || catalogSyncing}
                className="rounded-mesh bg-mesh-accent px-3 py-1.5 text-xs text-white disabled:pointer-events-none disabled:opacity-50"
                onClick={() => {
                  setConnecting(true)
                  void connectDiscoveredHub().finally(() => setConnecting(false))
                }}
              >
                {connecting ? '连接中…' : '一键连接'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {sources.map((source) => (
          <div
            key={source.id}
            className={cn(
              'rounded-mesh border border-mesh-border bg-mesh-card p-4',
              !source.enabled && 'opacity-70',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium">{source.name}</div>
                  {(source.type === 'skillsmp' || source.type === 'palebluedot') && (
                    <span className="rounded bg-mesh-panel px-1.5 py-0.5 text-[10px] text-mesh-dim">
                      索引源 · 安装为本地副本
                    </span>
                  )}
                  {!source.enabled ? (
                    <span className="rounded bg-mesh-panel px-1.5 py-0.5 text-[10px] text-mesh-warning">已禁用</span>
                  ) : null}
                  {source.accountBound ? (
                    <span className="rounded bg-mesh-panel px-1.5 py-0.5 text-[10px] text-mesh-accent">账号绑定</span>
                  ) : null}
                  {source.authStatus === 'lost' ? (
                    <span className="rounded bg-mesh-danger/15 px-1.5 py-0.5 text-[10px] text-mesh-danger">权限失效</span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-mesh-dim">{source.registryUrl || '本地离线源'}</div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-mesh-muted">
                  <span className="font-medium text-mesh-text">
                    {skillCountBySource.get(source.id) || 0} Skills
                  </span>
                  <span>
                    最近同步：
                    {source.lastSyncedAt
                      ? new Date(source.lastSyncedAt).toLocaleString()
                      : lastCatalogSyncedAt
                        ? new Date(lastCatalogSyncedAt).toLocaleString()
                        : '尚未同步'}
                  </span>
                </div>
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs">
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      !source.enabled || source.authStatus === 'lost'
                        ? 'bg-mesh-dim'
                        : source.status === 'connected'
                          ? 'bg-mesh-success'
                          : source.status === 'checking'
                            ? 'bg-mesh-warning'
                            : 'bg-mesh-danger',
                    )}
                  />
                  {!source.enabled
                    ? '已禁用'
                    : source.authStatus === 'lost'
                      ? '已失权'
                      : source.status === 'connected'
                        ? '已连接'
                        : source.status === 'checking'
                          ? '检测中'
                          : '未连接'}
                </div>
                {source.id === PANGU_HUB_SOURCE_ID || source.accountBound ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(source.namespaces || []).length ? (
                      source.namespaces!.map((ns) => (
                        <span
                          key={ns.slug}
                          className="rounded bg-mesh-panel px-1.5 py-0.5 text-[10px] text-mesh-dim"
                          title={`${ns.displayName} · ${ns.role}`}
                        >
                          @{ns.slug}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-mesh-dim">暂无命名空间</span>
                    )}
                  </div>
                ) : null}
                {source.type !== 'offline' ? (
                  <div className="mt-2 space-y-0.5 text-[11px] text-mesh-dim">
                    <div>
                      上次刷新列表：
                      {source.lastSyncedAt ? new Date(source.lastSyncedAt).toLocaleString() : '尚未刷新'}
                    </div>
                    {source.lastSyncError ? (
                      <div className="text-mesh-danger">失败：{source.lastSyncError}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={catalogSyncing}
                  title={source.enabled ? '禁用此源' : '启用此源'}
                  onClick={() => updateSource(source.id, { enabled: !source.enabled })}
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors disabled:pointer-events-none disabled:opacity-50',
                    source.enabled ? 'bg-mesh-accent' : 'bg-mesh-border',
                  )}
                  aria-label={`${source.enabled ? '禁用' : '启用'} ${source.name}`}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all',
                      source.enabled ? 'left-5' : 'left-0.5',
                    )}
                  />
                </button>
                {source.type !== 'offline' ? (
                  <CatalogRefreshButton
                    busy={catalogSyncing}
                    disabled={!source.enabled}
                    label="刷新列表"
                    busyLabel="刷新中…"
                    className="px-2.5 py-1.5"
                    onClick={() => void refreshCatalog({ sourceId: source.id, force: true })}
                  />
                ) : null}
                <button
                  type="button"
                  disabled={catalogSyncing || !source.enabled}
                  className="rounded-md border border-mesh-border px-2.5 py-1.5 text-xs disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => void testSource(source.id)}
                >
                  测试连接
                </button>
                <button
                  type="button"
                  disabled={catalogSyncing}
                  className="rounded-md border border-mesh-border px-2.5 py-1.5 text-xs disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => openEdit(source)}
                >
                  编辑
                </button>
                <button
                  type="button"
                  disabled={catalogSyncing}
                  className="rounded-md border border-mesh-danger/40 px-2.5 py-1.5 text-xs text-mesh-danger disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => void removeSource(source.id)}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-3 rounded-mesh border border-mesh-border bg-mesh-panel p-5">
            <h2 className="font-semibold">{editing ? '编辑源' : '添加源'}</h2>
            <input
              placeholder="名称"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2 text-sm"
            />
            <select
              value={form.type}
              onChange={(e) => {
                const type = e.target.value as SkillSource['type']
                const defaults: Partial<Record<SkillSource['type'], { name: string; url: string }>> = {
                  clawhub: { name: 'ClawHub', url: 'https://clawhub.ai' },
                  skillsmp: { name: 'SkillsMP', url: 'https://skillsmp.com' },
                  palebluedot: { name: 'Pale Blue Dot', url: 'https://skills.palebluedot.live' },
                  custom: { name: '本地 SkillHub', url: 'http://localhost:8080' },
                }
                const preset = defaults[type]
                setForm((f) => ({
                  ...f,
                  type,
                  name: preset && (!f.name.trim() || Object.values(defaults).some((d) => d.name === f.name))
                    ? preset.name
                    : f.name,
                  registryUrl: preset?.url ?? (type === 'offline' ? '' : f.registryUrl),
                }))
              }}
              className="w-full rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2 text-sm"
            >
              <option value="custom">SkillHub（自定义）</option>
              <option value="clawhub">ClawHub</option>
              <option value="skillsmp">SkillsMP</option>
              <option value="palebluedot">Pale Blue Dot</option>
            </select>
            <input
              placeholder={
                form.type === 'clawhub'
                  ? 'https://clawhub.ai'
                  : form.type === 'skillsmp'
                    ? 'https://skillsmp.com'
                    : form.type === 'palebluedot'
                      ? 'https://skills.palebluedot.live'
                      : 'API 根地址，例如 https://skill.xfyun.cn'
              }
              value={form.registryUrl}
              onChange={(e) => setForm((f) => ({ ...f, registryUrl: e.target.value }))}
              className="w-full rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2 text-sm"
              disabled={form.type === 'offline'}
            />
            <input
              placeholder="Token（可选）"
              type="password"
              value={form.token}
              onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
              className="w-full rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-mesh-dim">
              {form.type === 'clawhub'
                ? '对接 /api/v1/skills 与 /api/v1/search'
                : form.type === 'skillsmp'
                  ? '对接 /api/skills 与 /api/v1/skills/search'
                  : form.type === 'palebluedot'
                    ? '对接 /api/skills 公开索引'
                    : 'SkillHub 请求 /actuator/health 与 /api/cli/v1/skills/search'}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="rounded-mesh border border-mesh-border px-3 py-1.5 text-sm" onClick={() => setOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="rounded-mesh bg-mesh-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
                disabled={!form.name.trim()}
                onClick={() => {
                  if (editing) {
                    updateSource(editing.id, {
                      name: form.name.trim(),
                      registryUrl: form.registryUrl.trim() || undefined,
                      token: form.token || undefined,
                      type: form.type,
                    })
                    void testSource(editing.id)
                  } else {
                    addSource({
                      name: form.name.trim(),
                      registryUrl: form.registryUrl.trim() || undefined,
                      token: form.token || undefined,
                      type: form.type,
                      enabled: true,
                    })
                  }
                  setOpen(false)
                }}
              >
                保存并连接
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
