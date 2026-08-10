import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { PANGU_HUB_NAME, PANGU_HUB_SOURCE_ID } from '@/constants/pangu'
import { selectPublishableSkills, useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import type { PublishStatus, SkillVisibility } from '@/types'

const FILTERS: Array<{ id: 'all' | PublishStatus; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'reviewing', label: '审核中' },
  { id: 'published', label: '已发布' },
  { id: 'uploaded', label: '已上传' },
  { id: 'withdrawn', label: '已撤回' },
  { id: 'rejected', label: '已驳回' },
]

const VISIBILITY_OPTIONS: Array<{ id: SkillVisibility; label: string; hint: string }> = [
  { id: 'PUBLIC', label: '公开', hint: '所有人可见，通常需审核' },
  { id: 'NAMESPACE_ONLY', label: '仅空间内', hint: '命名空间成员可见，通常需审核' },
  { id: 'PRIVATE', label: '私有', hint: '仅自己可见；无需审核，其他人不可见' },
]

export function PublishPage() {
  const items = useAppStore((s) => s.publishItems)
  const filter = useAppStore((s) => s.publishFilter)
  const setPublishFilter = useAppStore((s) => s.setPublishFilter)
  const account = useAppStore((s) => s.account)
  const setLoginOpen = useAppStore((s) => s.setLoginOpen)
  const skills = useAppStore(useShallow(selectPublishableSkills))
  const panguSource = useAppStore((s) =>
    s.sources.find((src) => src.id === PANGU_HUB_SOURCE_ID && src.accountBound && src.enabled),
  )
  const submitPublish = useAppStore((s) => s.submitPublish)
  const withdrawPublishReview = useAppStore((s) => s.withdrawPublishReview)
  const deletePublishedSkill = useAppStore((s) => s.deletePublishedSkill)
  const refreshPublishStatuses = useAppStore((s) => s.refreshPublishStatuses)

  const [wizardOpen, setWizardOpen] = useState(false)
  const [syncingStatus, setSyncingStatus] = useState(false)
  const [skillUid, setSkillUid] = useState('')
  const [namespace, setNamespace] = useState('')
  const [visibility, setVisibility] = useState<SkillVisibility>('PUBLIC')
  const [version, setVersion] = useState('1.0.0')
  const [submitting, setSubmitting] = useState(false)
  const [warningOpen, setWarningOpen] = useState(false)
  const [warningText, setWarningText] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const namespaces = panguSource?.namespaces || []
  const loggedIn = !!account.loggedIn
  const canPublish = loggedIn && !!panguSource && namespaces.length > 0 && skills.length > 0
  const hasPendingRemote = items.some(
    (item) =>
      !!item.slug &&
      item.visibility !== 'PRIVATE' &&
      (item.status === 'reviewing' || item.status === 'uploaded' || item.status === 'rejected'),
  )

  const syncStatuses = async (silent = true) => {
    if (!loggedIn) return
    setSyncingStatus(true)
    try {
      await refreshPublishStatuses({ silent })
    } finally {
      setSyncingStatus(false)
    }
  }

  // Enter page / re-focus: pull remote review status
  useEffect(() => {
    if (!loggedIn) return
    void syncStatuses(true)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncStatuses(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync on mount / login only
  }, [loggedIn, refreshPublishStatuses])

  // Auto-poll while there are reviewing / uploaded items awaiting remote change
  useEffect(() => {
    if (!loggedIn || !hasPendingRemote) return
    const timer = window.setInterval(() => {
      void syncStatuses(true)
    }, 20000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, hasPendingRemote, refreshPublishStatuses])

  useEffect(() => {
    if (!skillUid && skills[0]) {
      setSkillUid(skills[0].uid)
      setVersion(skills[0].version || '1.0.0')
    }
    if (skillUid && !skills.some((s) => s.uid === skillUid)) {
      setSkillUid(skills[0]?.uid || '')
      setVersion(skills[0]?.version || '1.0.0')
    }
  }, [skills, skillUid])

  useEffect(() => {
    if (!namespace || !namespaces.some((n) => n.slug === namespace)) {
      setNamespace(namespaces[0]?.slug || '')
    }
  }, [namespace, namespaces])

  const selectedSkill = skills.find((s) => s.uid === skillUid)

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.status === filter)),
    [filter, items],
  )

  const openWizard = () => {
    if (!loggedIn) {
      setLoginOpen(true)
      return
    }
    if (!panguSource || !namespaces.length) {
      useAppStore.getState().showToast('请先一键连接盘古 Hub，并确保账号有命名空间', 'warning')
      return
    }
    if (!skills.length) {
      useAppStore.getState().showToast('请先在「我的」新建或导入 Skill', 'warning')
      return
    }
    setSkillUid(skills[0].uid)
    setVersion(skills[0].version || '1.0.0')
    setNamespace(namespaces[0]?.slug || '')
    setVisibility('PUBLIC')
    setWarningOpen(false)
    setWizardOpen(true)
  }

  const doSubmit = async (confirmWarnings = false) => {
    if (!skillUid || !namespace) return
    setSubmitting(true)
    try {
      const result = await submitPublish({
        skillUid,
        namespace,
        visibility,
        version,
        confirmWarnings,
      })
      if (result.confirmRequired) {
        setWarningText(result.message || '发布预检存在警告，确认后继续？')
        setWarningOpen(true)
        return
      }
      if (result.ok) {
        setWizardOpen(false)
        setWarningOpen(false)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-[960px] space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">发布</h1>
          <p className="mt-1 text-sm text-mesh-dim">
            登录后发布到 {PANGU_HUB_NAME} 命名空间；选项与 SkillHub 空间内发布一致（命名空间 + 可见性）
          </p>
        </div>
        <div className="flex gap-2">
          {loggedIn ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-mesh border border-mesh-border px-3 py-2 text-sm text-mesh-muted hover:bg-mesh-card disabled:opacity-50"
              disabled={syncingStatus || submitting}
              onClick={() => void syncStatuses(false)}
            >
              {syncingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {syncingStatus ? '同步中…' : '同步审核状态'}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-mesh bg-mesh-accent px-3 py-2 text-sm text-white hover:bg-mesh-accent/90 disabled:opacity-50"
            disabled={submitting}
            onClick={openWizard}
          >
            + 发布 Skill
          </button>
        </div>
      </div>

      {!loggedIn ? (
        <div className="rounded-mesh border border-dashed border-mesh-border bg-mesh-card/60 px-4 py-3 text-sm">
          <div className="font-medium">游客不能发布</div>
          <p className="mt-1 text-xs text-mesh-dim">请先登录 SkillHub 账号，并连接盘古 Hub 后再发布。</p>
          <button
            type="button"
            className="mt-3 rounded-mesh bg-mesh-accent px-3 py-1.5 text-xs text-white"
            onClick={() => setLoginOpen(true)}
          >
            去登录
          </button>
        </div>
      ) : !panguSource ? (
        <div className="rounded-mesh border border-dashed border-mesh-border px-4 py-3 text-xs text-mesh-dim">
          已登录，但尚未连接盘古 Hub。请前往
          <Link to="/settings/sources" className="mx-1 text-mesh-accent hover:underline">
            技能源配置
          </Link>
          一键连接后再发布。
        </div>
      ) : !namespaces.length ? (
        <div className="rounded-mesh border border-dashed border-mesh-border px-4 py-3 text-xs text-mesh-dim">
          当前账号在盘古 Hub 下没有可用命名空间，无法发布。
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 rounded-mesh border border-mesh-border bg-mesh-panel p-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setPublishFilter(f.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm',
              filter === f.id ? 'bg-mesh-accentSoft text-mesh-text' : 'text-mesh-muted hover:text-mesh-text',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.map((item) => (
          <div key={item.id} className="rounded-mesh border border-mesh-border bg-mesh-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium">{item.name}</div>
                <div className="mt-1 text-xs text-mesh-dim">
                  v{item.version}
                  {item.slug ? ` · ${item.namespace}/${item.slug}` : item.namespace ? ` · @${item.namespace}` : ''}
                  {item.visibility ? ` · ${visibilityLabel(item.visibility)}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={item.status} />
                {item.status === 'reviewing' ? (
                  <button
                    type="button"
                    disabled={busyId === item.id || !loggedIn}
                    className="rounded-md border border-mesh-border px-2.5 py-1 text-xs disabled:opacity-50"
                    onClick={() => {
                      setBusyId(item.id)
                      void withdrawPublishReview(item.id).finally(() => setBusyId(null))
                    }}
                  >
                    {busyId === item.id ? '撤回中…' : '撤回审核'}
                  </button>
                ) : null}
                {item.slug && item.status !== 'withdrawn' ? (
                  <button
                    type="button"
                    disabled={busyId === item.id || !loggedIn}
                    className="rounded-md border border-mesh-danger/40 px-2.5 py-1 text-xs text-mesh-danger disabled:opacity-50"
                    onClick={() => {
                      setBusyId(item.id)
                      void deletePublishedSkill(item.id).finally(() => setBusyId(null))
                    }}
                  >
                    {busyId === item.id ? '删除中…' : '删除'}
                  </button>
                ) : null}
              </div>
            </div>
            {item.visibility === 'PRIVATE' && item.status === 'uploaded' ? (
              <div className="mt-2 text-xs text-mesh-dim">私人 Skill 无需审核，其他人不可见</div>
            ) : null}
            {item.reason ? <div className="mt-2 text-xs text-mesh-danger">原因：{item.reason}</div> : null}
          </div>
        ))}
        {!visible.length ? (
          <div className="rounded-mesh border border-dashed border-mesh-border py-16 text-center">
            <div className="text-sm text-mesh-muted">暂无发布记录</div>
            <p className="mt-2 text-xs text-mesh-dim">
              {canPublish
                ? '选择本地新建/导入的 Skill，发布到盘古 Hub 命名空间'
                : '登录并连接盘古 Hub 后，可发布「我的」中的 Skill'}
            </p>
            {canPublish ? (
              <button
                type="button"
                className="mt-4 inline-flex rounded-mesh bg-mesh-accent px-3 py-1.5 text-xs text-white"
                onClick={openWizard}
              >
                发布 Skill
              </button>
            ) : (
              <Link
                to={loggedIn ? '/settings/sources' : '/skills/mine'}
                className="mt-4 inline-flex rounded-mesh bg-mesh-accent px-3 py-1.5 text-xs text-white hover:bg-mesh-accent/90"
                onClick={(e) => {
                  if (!loggedIn) {
                    e.preventDefault()
                    setLoginOpen(true)
                  }
                }}
              >
                {loggedIn ? '去连接盘古 Hub' : '去登录'}
              </Link>
            )}
          </div>
        ) : null}
      </div>

      {wizardOpen ? (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-mesh border border-mesh-border bg-mesh-panel p-5 shadow-mesh">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">发布到 {PANGU_HUB_NAME}</h2>
              <button
                type="button"
                className="text-sm text-mesh-dim disabled:opacity-50"
                disabled={submitting}
                onClick={() => setWizardOpen(false)}
              >
                关闭
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <label className="block space-y-2">
                <span className="text-mesh-muted">Skill（新建 / 本地导入）</span>
                <select
                  value={skillUid}
                  disabled={submitting}
                  onChange={(e) => {
                    const next = skills.find((s) => s.uid === e.target.value)
                    setSkillUid(e.target.value)
                    setVersion(next?.version || '1.0.0')
                  }}
                  className="w-full rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2"
                >
                  {skills.map((s) => (
                    <option key={s.uid} value={s.uid}>
                      {s.name} · {s.origin === 'created' ? '新建' : '本地导入'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-mesh-muted">命名空间</span>
                <select
                  value={namespace}
                  disabled={submitting}
                  onChange={(e) => setNamespace(e.target.value)}
                  className="w-full rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2"
                >
                  {namespaces.map((ns) => (
                    <option key={ns.slug} value={ns.slug}>
                      {ns.displayName} (@{ns.slug}) · {ns.role}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-2">
                <span className="text-mesh-muted">可见性</span>
                <div className="space-y-1.5">
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <label
                      key={opt.id}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded-mesh border px-3 py-2',
                        visibility === opt.id ? 'border-mesh-accent bg-mesh-accentSoft/40' : 'border-mesh-border',
                      )}
                    >
                      <input
                        type="radio"
                        name="visibility"
                        className="mt-1"
                        checked={visibility === opt.id}
                        disabled={submitting}
                        onChange={() => setVisibility(opt.id)}
                      />
                      <span>
                        <span className="font-medium text-mesh-text">{opt.label}</span>
                        <span className="mt-0.5 block text-[11px] text-mesh-dim">{opt.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="block space-y-2">
                <span className="text-mesh-muted">版本（写入 SKILL.md，与 SkillHub 一致）</span>
                <input
                  value={version}
                  disabled={submitting}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2"
                  placeholder="1.0.0"
                />
              </label>

              <div className="rounded-mesh border border-mesh-border bg-mesh-card/60 px-3 py-2 text-xs text-mesh-dim">
                将打包本地目录并上传到 @{namespace || '…'}
                {selectedSkill?.localPath ? ` · ${selectedSkill.localPath}` : ''}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-mesh border border-mesh-border px-3 py-1.5 text-sm disabled:opacity-50"
                disabled={submitting}
                onClick={() => setWizardOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-mesh bg-mesh-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
                disabled={submitting || !skillUid || !namespace}
                onClick={() => void doSubmit(false)}
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {submitting ? '发布中…' : visibility === 'PRIVATE' ? '上传' : '提交发布'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {warningOpen ? (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-mesh border border-mesh-border bg-mesh-panel p-5 shadow-mesh">
            <h3 className="font-semibold">发布预检警告</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-mesh-muted">{warningText}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-mesh border border-mesh-border px-3 py-1.5 text-sm"
                disabled={submitting}
                onClick={() => setWarningOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-mesh bg-mesh-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
                disabled={submitting}
                onClick={() => void doSubmit(true)}
              >
                {submitting ? '提交中…' : '确认并继续'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function visibilityLabel(v: SkillVisibility) {
  return VISIBILITY_OPTIONS.find((o) => o.id === v)?.label || v
}

function StatusBadge({ status }: { status: PublishStatus }) {
  const map: Record<PublishStatus, { label: string; className: string }> = {
    published: { label: '已发布', className: 'text-mesh-success' },
    reviewing: { label: '审核中', className: 'text-mesh-warning' },
    rejected: { label: '已驳回', className: 'text-mesh-danger' },
    uploaded: { label: '已上传', className: 'text-mesh-accent' },
    withdrawn: { label: '已撤回', className: 'text-mesh-dim' },
  }
  const item = map[status] || map.reviewing
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', item.className)}>
      ● {item.label}
    </span>
  )
}
