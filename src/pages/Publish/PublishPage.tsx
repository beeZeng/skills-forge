import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileArchive, Loader2, Upload } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { PANGU_HUB_NAME, PANGU_HUB_SOURCE_ID } from '@/constants/pangu'
import { selectPublishableSkills, useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import type { PublishStatus, SkillPackageFileNode, SkillVisibility } from '@/types'
import type { PublishPrepareResult } from '@/vite-env'

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

type WizardMode = 'upload' | 'mine'
type WizardStep = 'source' | 'entry' | 'preview' | 'target'

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
  const preparePublishUpload = useAppStore((s) => s.preparePublishUpload)
  const finalizePublishUpload = useAppStore((s) => s.finalizePublishUpload)
  const submitPreparedPublish = useAppStore((s) => s.submitPreparedPublish)
  const cleanupPublishUpload = useAppStore((s) => s.cleanupPublishUpload)
  const withdrawPublishReview = useAppStore((s) => s.withdrawPublishReview)
  const deletePublishedSkill = useAppStore((s) => s.deletePublishedSkill)
  const refreshPublishStatuses = useAppStore((s) => s.refreshPublishStatuses)

  const [wizardOpen, setWizardOpen] = useState(false)
  const [mode, setMode] = useState<WizardMode>('upload')
  const [step, setStep] = useState<WizardStep>('source')
  const [syncingStatus, setSyncingStatus] = useState(false)
  const [skillUid, setSkillUid] = useState('')
  const [namespace, setNamespace] = useState('')
  const [visibility, setVisibility] = useState<SkillVisibility>('PUBLIC')
  const [version, setVersion] = useState('1.0.0')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [entry, setEntry] = useState('')
  const [zipLabel, setZipLabel] = useState('')
  const [prepared, setPrepared] = useState<PublishPrepareResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [warningOpen, setWarningOpen] = useState(false)
  const [warningText, setWarningText] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const namespaces = panguSource?.namespaces || []
  const loggedIn = !!account.loggedIn
  const canOpenWizard = loggedIn && !!panguSource && namespaces.length > 0
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

  useEffect(() => {
    if (!loggedIn) return
    void syncStatuses(true)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncStatuses(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, refreshPublishStatuses])

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

  const resetWizard = async () => {
    if (prepared?.sessionDir) await cleanupPublishUpload(prepared.sessionDir)
    setPrepared(null)
    setZipLabel('')
    setEntry('')
    setName('')
    setDescription('')
    setVersion('1.0.0')
    setMode('upload')
    setStep('source')
    setWarningOpen(false)
  }

  const openWizard = () => {
    if (!loggedIn) {
      setLoginOpen(true)
      return
    }
    if (!panguSource || !namespaces.length) {
      useAppStore.getState().showToast('请先一键连接盘古 Hub，并确保账号有命名空间', 'warning')
      return
    }
    void resetWizard().then(() => {
      setNamespace(namespaces[0]?.slug || '')
      setVisibility('PUBLIC')
      setWizardOpen(true)
    })
  }

  const closeWizard = () => {
    void resetWizard().then(() => setWizardOpen(false))
  }

  const applyPrepared = (result: PublishPrepareResult) => {
    setPrepared(result)
    if (result.needsEntrySelection) {
      setEntry(result.entryCandidates?.[0] || '')
      setName(result.suggestedName || name)
      setStep('entry')
      return
    }
    if (result.ready && result.manifest) {
      setName(result.manifest.name)
      setDescription(result.manifest.description || '')
      setVersion(result.manifest.version || '1.0.0')
      setEntry(result.entry || '')
      setStep('preview')
    }
  }

  const pickZip = async () => {
    const picked = await window.skillMesh?.dialog.openPublishZip?.()
    if (!picked) return
    if (!/\.zip$/i.test(picked)) {
      useAppStore.getState().showToast('仅支持 .zip 文件', 'warning')
      return
    }
    setZipLabel(picked.split(/[/\\]/).pop() || picked)
    setPreparing(true)
    try {
      if (prepared?.sessionDir) await cleanupPublishUpload(prepared.sessionDir)
      const result = await preparePublishUpload({
        zipPath: picked,
        name: name || undefined,
        description: description || undefined,
        version: version || '1.0.0',
      })
      applyPrepared(result)
    } finally {
      setPreparing(false)
    }
  }

  const confirmEntry = async () => {
    if (!prepared || !entry) return
    setPreparing(true)
    try {
      const result = await finalizePublishUpload({
        sessionDir: prepared.sessionDir,
        sessionId: prepared.sessionId,
        extractDir: prepared.extractDir,
        kind: prepared.kind,
        entry,
        entryCandidates: prepared.entryCandidates,
        name: name || prepared.suggestedName,
        description,
        version: version || '1.0.0',
      })
      applyPrepared(result)
    } finally {
      setPreparing(false)
    }
  }

  const rebuildPreview = async () => {
    if (!prepared?.sessionDir) {
      setStep('target')
      return
    }
    setPreparing(true)
    try {
      const result = await finalizePublishUpload({
        sessionDir: prepared.sessionDir,
        sessionId: prepared.sessionId,
        extractDir: prepared.extractDir || prepared.packageDir,
        kind: prepared.kind,
        entry: entry || prepared.entry || '',
        entryCandidates: prepared.entryCandidates,
        name: name || prepared.manifest?.name,
        description,
        version: version || '1.0.0',
      })
      if (result.ok && result.ready) {
        setPrepared(result)
        setStep('target')
      } else {
        applyPrepared(result)
      }
    } finally {
      setPreparing(false)
    }
  }

  const doSubmitUpload = async (confirmWarnings = false) => {
    if (!prepared?.ready || !namespace) return
    setSubmitting(true)
    try {
      const result = await submitPreparedPublish({
        prepared,
        namespace,
        visibility,
        confirmWarnings,
      })
      if (result.confirmRequired) {
        setWarningText(result.message || '发布预检存在警告，确认后继续？')
        setWarningOpen(true)
        return
      }
      if (result.ok) {
        setPrepared(null)
        setWizardOpen(false)
        setWarningOpen(false)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const doSubmitMine = async (confirmWarnings = false) => {
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

  const doSubmit = (confirmWarnings = false) => {
    if (mode === 'upload') return void doSubmitUpload(confirmWarnings)
    return void doSubmitMine(confirmWarnings)
  }

  return (
    <div className="mx-auto max-w-[960px] space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">发布技能</h1>
          <p className="mt-1 text-sm text-mesh-dim">
            上传 zip → 自动规范化 → 预览 → 发布到 {PANGU_HUB_NAME}
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
            技能来源
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
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.name}</span>
                  <span className="font-mono text-xs text-mesh-dim">v{item.version}</span>
                  <StatusBadge status={item.status} />
                </div>
                <div className="mt-1 text-xs text-mesh-dim">
                  {item.sourceName}
                  {item.namespace ? ` · @${item.namespace}` : ''}
                  {item.slug ? ` / ${item.slug}` : ''}
                  {item.visibility ? ` · ${visibilityLabel(item.visibility)}` : ''}
                </div>
                {item.visibility === 'PRIVATE' ? (
                  <div className="mt-2 text-xs text-mesh-dim">私人 Skill 无需审核，其他人不可见</div>
                ) : null}
                {item.reason ? <div className="mt-2 text-xs text-mesh-danger">原因：{item.reason}</div> : null}
              </div>
              <div className="flex gap-2">
                {item.status === 'reviewing' ? (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    className="rounded-md border border-mesh-border px-2.5 py-1 text-xs hover:bg-mesh-panel disabled:opacity-50"
                    onClick={() => {
                      setBusyId(item.id)
                      void withdrawPublishReview(item.id).finally(() => setBusyId(null))
                    }}
                  >
                    撤回审核
                  </button>
                ) : null}
                {item.status === 'published' || item.status === 'uploaded' ? (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    className="rounded-md border border-mesh-danger/40 px-2.5 py-1 text-xs text-mesh-danger hover:bg-mesh-danger/10 disabled:opacity-50"
                    onClick={() => {
                      setBusyId(item.id)
                      void deletePublishedSkill(item.id).finally(() => setBusyId(null))
                    }}
                  >
                    删除
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        {!visible.length ? (
          <div className="rounded-mesh border border-dashed border-mesh-border py-16 text-center">
            <div className="text-sm text-mesh-muted">暂无发布记录</div>
            <p className="mt-2 text-xs text-mesh-dim">
              {canOpenWizard ? '上传任意 Skill zip，平台将自动规范化后发布' : '登录并连接盘古 Hub 后即可发布'}
            </p>
            {canOpenWizard ? (
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

      {wizardOpen
        ? createPortal(
            <div className="fixed inset-0 z-[180] bg-black/50">
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`发布到 ${PANGU_HUB_NAME}`}
                className="absolute left-1/2 top-1/2 flex w-[min(calc(100%-2rem),36rem)] max-h-[min(640px,calc(100vh-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-mesh-border bg-mesh-panel shadow-mesh"
              >
            <div className="flex shrink-0 items-center justify-between border-b border-mesh-border px-5 py-4">
              <div>
                <h2 className="font-semibold">发布到 {PANGU_HUB_NAME}</h2>
                <p className="mt-0.5 text-xs text-mesh-dim">
                  {step === 'source' && '① 上传 zip 或选择本地 Skill'}
                  {step === 'entry' && '② 选择入口文件'}
                  {step === 'preview' && '③ 预览规范化结果'}
                  {step === 'target' && '④ 选择命名空间并发布'}
                </p>
              </div>
              <button
                type="button"
                className="text-sm text-mesh-dim disabled:opacity-50"
                disabled={submitting || preparing}
                onClick={closeWizard}
              >
                关闭
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
              {step === 'source' ? (
                <div className="space-y-4 text-sm">
                  <div className="flex gap-2 rounded-mesh border border-mesh-border bg-mesh-card p-1">
                    <button
                      type="button"
                      className={cn(
                        'flex-1 rounded-md px-3 py-2 text-sm',
                        mode === 'upload' ? 'bg-mesh-accentSoft text-mesh-text' : 'text-mesh-muted',
                      )}
                      onClick={() => setMode('upload')}
                    >
                      上传 Zip
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'flex-1 rounded-md px-3 py-2 text-sm',
                        mode === 'mine' ? 'bg-mesh-accentSoft text-mesh-text' : 'text-mesh-muted',
                      )}
                      onClick={() => setMode('mine')}
                    >
                      我的技能
                    </button>
                  </div>

                  {mode === 'upload' ? (
                    <div className="space-y-3">
                      <button
                        type="button"
                        disabled={preparing}
                        onClick={() => void pickZip()}
                        className="flex w-full flex-col items-center justify-center gap-2 rounded-mesh border border-dashed border-mesh-borderBright bg-mesh-card/50 px-4 py-6 text-mesh-muted hover:border-mesh-accent hover:text-mesh-text disabled:opacity-50"
                      >
                        {preparing ? (
                          <Loader2 className="h-8 w-8 animate-spin text-mesh-accent" />
                        ) : (
                          <Upload className="h-8 w-8 text-mesh-accent" />
                        )}
                        <span className="font-medium text-mesh-text">
                          {preparing ? '正在解析与规范化…' : '选择 .zip 文件'}
                        </span>
                        <span className="text-xs text-mesh-dim">
                          支持普通压缩包或标准 Skill Package · 上传后不会直接发布
                        </span>
                        {zipLabel ? (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-mesh-panel px-2 py-1 font-mono text-[11px] text-mesh-muted">
                            <FileArchive className="h-3.5 w-3.5" />
                            {zipLabel}
                          </span>
                        ) : null}
                      </button>
                      <p className="text-xs text-mesh-dim">
                        平台将自动：解压 → 检测格式 → 生成 manifest / README / skill.md → 安全检查 → 重新打包
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {!skills.length ? (
                        <div className="rounded-mesh border border-dashed border-mesh-border px-3 py-6 text-center text-xs text-mesh-dim">
                          暂无本地新建/导入的 Skill，请改用「上传 Zip」
                        </div>
                      ) : (
                        <>
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
                            <span className="text-mesh-muted">版本</span>
                            <input
                              value={version}
                              onChange={(e) => setVersion(e.target.value)}
                              className="w-full rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2"
                              placeholder="1.0.0"
                            />
                          </label>
                          <button
                            type="button"
                            className="rounded-mesh bg-mesh-accent px-3 py-2 text-sm text-white disabled:opacity-50"
                            disabled={!skillUid}
                            onClick={() => setStep('target')}
                          >
                            下一步：发布目标
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : null}

              {step === 'entry' ? (
                <div className="space-y-3 text-sm">
                  <p className="text-mesh-muted">检测到多个可能的入口，请选择 Skill 入口文件：</p>
                  <div className="space-y-1.5">
                    {(prepared?.entryCandidates || []).map((cand) => (
                      <label
                        key={cand}
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-mesh border px-3 py-2',
                          entry === cand ? 'border-mesh-accent bg-mesh-accentSoft/40' : 'border-mesh-border',
                        )}
                      >
                        <input
                          type="radio"
                          name="entry"
                          checked={entry === cand}
                          onChange={() => setEntry(cand)}
                        />
                        <span className="font-mono text-xs">{cand}</span>
                      </label>
                    ))}
                  </div>
                  <label className="block space-y-1">
                    <span className="text-xs text-mesh-dim">展示名称</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2"
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-mesh border border-mesh-border px-3 py-1.5"
                      onClick={() => setStep('source')}
                    >
                      返回
                    </button>
                    <button
                      type="button"
                      disabled={!entry || preparing}
                      className="inline-flex items-center gap-1.5 rounded-mesh bg-mesh-accent px-3 py-1.5 text-white disabled:opacity-50"
                      onClick={() => void confirmEntry()}
                    >
                      {preparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      继续规范化
                    </button>
                  </div>
                </div>
              ) : null}

              {step === 'preview' && prepared?.manifest ? (
                <div className="space-y-4 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-xs text-mesh-dim">名称</span>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-mesh-dim">版本</span>
                      <input
                        value={version}
                        onChange={(e) => setVersion(e.target.value)}
                        className="w-full rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2"
                      />
                    </label>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-xs text-mesh-dim">描述</span>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="w-full rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2"
                    />
                  </label>

                  <div className="rounded-mesh border border-mesh-border bg-mesh-card p-3 text-xs">
                    <div className="mb-2 font-medium text-mesh-text">Skill 信息</div>
                    <MetaRow label="skill_id" value={prepared.manifest.skill_id} />
                    <MetaRow label="作者" value={prepared.manifest.author || account.displayName || '-'} />
                    <MetaRow label="来源" value={prepared.manifest.source || 'SkillHub'} />
                    <MetaRow label="入口" value={prepared.entry || '-'} />
                    <MetaRow label="类型" value={prepared.kind === 'standard' ? '标准 Skill 包' : '普通 Skill（已规范化）'} />
                    <MetaRow label="安装目标" value={prepared.installTarget || 'Local Agent'} />
                    <MetaRow label="产物" value={prepared.zipName || '-'} />
                  </div>

                  <div className="rounded-mesh border border-mesh-border bg-mesh-card p-3">
                    <div className="mb-2 text-xs font-medium">文件结构</div>
                    <div className="max-h-40 overflow-auto font-mono text-[11px] text-mesh-muted">
                      <TreePreview nodes={prepared.fileTree || []} />
                    </div>
                  </div>

                  {prepared.warnings?.length ? (
                    <div className="rounded-mesh border border-mesh-warning/40 bg-mesh-warning/10 px-3 py-2 text-xs text-mesh-warning">
                      {prepared.warnings.join('；')}
                    </div>
                  ) : null}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-mesh border border-mesh-border px-3 py-1.5"
                      onClick={() => setStep('source')}
                    >
                      重新上传
                    </button>
                    <button
                      type="button"
                      disabled={preparing}
                      className="inline-flex items-center gap-1.5 rounded-mesh bg-mesh-accent px-3 py-1.5 text-white disabled:opacity-50"
                      onClick={() => void rebuildPreview()}
                    >
                      {preparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      下一步：发布目标
                    </button>
                  </div>
                </div>
              ) : null}

              {step === 'target' ? (
                <div className="space-y-3 text-sm">
                  {mode === 'upload' && prepared?.manifest ? (
                    <div className="rounded-mesh border border-mesh-border bg-mesh-card/60 px-3 py-2 text-xs text-mesh-dim">
                      将发布 <span className="text-mesh-text">{prepared.manifest.name}</span> · v
                      {prepared.manifest.version} · {prepared.zipName}
                    </div>
                  ) : (
                    <div className="rounded-mesh border border-mesh-border bg-mesh-card/60 px-3 py-2 text-xs text-mesh-dim">
                      将打包本地 Skill「{selectedSkill?.name}」并上传
                    </div>
                  )}

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

                  <div className="flex justify-between gap-2 pt-2">
                    <button
                      type="button"
                      className="rounded-mesh border border-mesh-border px-3 py-1.5"
                      disabled={submitting}
                      onClick={() => setStep(mode === 'upload' ? 'preview' : 'source')}
                    >
                      上一步
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-mesh bg-mesh-accent px-3 py-1.5 text-white disabled:opacity-50"
                      disabled={
                        submitting ||
                        !namespace ||
                        (mode === 'mine' && !skillUid) ||
                        (mode === 'upload' && !prepared?.zipPath)
                      }
                      onClick={() => void doSubmit(false)}
                    >
                      {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {submitting ? '发布中…' : visibility === 'PRIVATE' ? '上传' : '提交发布'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {warningOpen
        ? createPortal(
            <div className="fixed inset-0 z-[190] bg-black/50">
              <div className="absolute left-1/2 top-1/2 w-[min(calc(100%-2rem),28rem)] -translate-x-1/2 -translate-y-1/2 rounded-mesh border border-mesh-border bg-mesh-panel p-5 shadow-mesh">
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
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-mesh-dim">{label}</span>
      <span className="max-w-[70%] truncate text-right text-mesh-text" title={value}>
        {value}
      </span>
    </div>
  )
}

function TreePreview({ nodes, depth = 0 }: { nodes: SkillPackageFileNode[]; depth?: number }) {
  if (!nodes?.length) return <div className="text-mesh-dim">（空）</div>
  return (
    <ul className={cn(depth ? 'ml-3 border-l border-mesh-border pl-2' : '')}>
      {nodes.map((node) => (
        <li key={node.path}>
          <div>
            {node.type === 'dir' ? '📁 ' : '📄 '}
            {node.name}
          </div>
          {node.children?.length ? <TreePreview nodes={node.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
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
