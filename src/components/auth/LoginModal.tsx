import { useEffect, useState, type FormEvent } from 'react'
import { testSourceConnection } from '@/services/skillhub-client'
import { useAppStore } from '@/stores/app-store'

export function LoginModal() {
  const open = useAppStore((s) => s.loginOpen)
  const setLoginOpen = useAppStore((s) => s.setLoginOpen)
  const setPanguHubUrl = useAppStore((s) => s.setPanguHubUrl)
  const login = useAppStore((s) => s.login)
  const showToast = useAppStore((s) => s.showToast)
  const panguHubUrl = useAppStore((s) => s.panguHubUrl)
  const [hubUrl, setHubUrl] = useState(panguHubUrl)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'login' | 'test' | 'save' | null>(null)
  const [error, setError] = useState('')
  const [hubHint, setHubHint] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setHubUrl(panguHubUrl)
    setError('')
    setHubHint(null)
  }, [open, panguHubUrl])

  if (!open) return null

  const onTestConnection = async () => {
    const trimmedUrl = hubUrl.trim()
    if (!trimmedUrl) {
      setHubHint({ ok: false, text: '请填写 SkillHub 地址' })
      return
    }
    setBusy('test')
    setHubHint(null)
    setError('')
    try {
      const result = await testSourceConnection({
        registryUrl: trimmedUrl,
        type: 'custom',
      })
      if (result.ok) {
        const text = result.message || `连接成功${result.baseUrl ? ` · ${result.baseUrl}` : ''}`
        setHubHint({ ok: true, text })
        showToast(text, 'success')
      } else {
        const text = result.message || '连接失败'
        setHubHint({ ok: false, text })
        showToast(text, 'error')
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : '连接失败'
      setHubHint({ ok: false, text })
      showToast(text, 'error')
    } finally {
      setBusy(null)
    }
  }

  const onSaveUrl = () => {
    setBusy('save')
    setError('')
    const result = setPanguHubUrl(hubUrl)
    setBusy(null)
    if (!result.ok) {
      setHubHint({ ok: false, text: result.message || '保存失败' })
      showToast(result.message || '保存失败', 'error')
      return
    }
    if (result.url) setHubUrl(result.url)
    setHubHint({ ok: true, text: `地址已保存 · ${result.url}` })
    showToast('SkillHub 地址已保存', 'success')
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedUrl = hubUrl.trim()
    if (!trimmedUrl) {
      setError('请填写 SkillHub 地址')
      return
    }
    setBusy('login')
    setError('')
    const result = await login({
      username: username.trim(),
      password,
      baseUrl: trimmedUrl,
    })
    setBusy(null)
    if (!result.ok) {
      setError(result.message || '登录失败')
    }
  }

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-mesh border border-mesh-border bg-mesh-panel p-5 shadow-mesh">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">登录 SkillHub 账号</h2>
            <p className="mt-1 text-xs text-mesh-dim">
              与盘古 Hub 使用同一账号。不登录也可浏览公共 Skill。
            </p>
          </div>
          <button
            type="button"
            className="text-sm text-mesh-dim hover:text-mesh-text"
            onClick={() => setLoginOpen(false)}
          >
            关闭
          </button>
        </div>

        <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
          <div className="space-y-1.5 text-sm">
            <span className="text-mesh-muted">SkillHub 地址</span>
            <input
              value={hubUrl}
              onChange={(e) => {
                setHubUrl(e.target.value)
                setHubHint(null)
              }}
              placeholder="http://localhost:8080"
              className="w-full rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2 font-mono text-xs outline-none focus:border-mesh-accent"
              autoComplete="url"
              inputMode="url"
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-2 pt-0.5">
              <button
                type="button"
                disabled={busy !== null || !hubUrl.trim()}
                onClick={() => void onTestConnection()}
                className="rounded-mesh border border-mesh-border px-2.5 py-1 text-xs hover:bg-mesh-card disabled:opacity-50"
              >
                {busy === 'test' ? '测试中…' : '测试连接'}
              </button>
              <button
                type="button"
                disabled={busy !== null || !hubUrl.trim()}
                onClick={onSaveUrl}
                className="rounded-mesh border border-mesh-border px-2.5 py-1 text-xs hover:bg-mesh-card disabled:opacity-50"
              >
                {busy === 'save' ? '保存中…' : '保存'}
              </button>
            </div>
            {hubHint ? (
              <p className={`text-[11px] ${hubHint.ok ? 'text-mesh-success' : 'text-mesh-danger'}`}>
                {hubHint.text}
              </p>
            ) : (
              <p className="text-[11px] text-mesh-dim">可先测试连接并保存地址，再登录账号</p>
            )}
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="text-mesh-muted">用户名</span>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2 outline-none focus:border-mesh-accent"
              autoComplete="username"
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-mesh-muted">密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-mesh border border-mesh-border bg-mesh-card px-3 py-2 outline-none focus:border-mesh-accent"
              autoComplete="current-password"
            />
          </label>
          {error ? <div className="text-xs text-mesh-danger">{error}</div> : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="rounded-mesh border border-mesh-border px-3 py-1.5 text-sm"
              onClick={() => setLoginOpen(false)}
            >
              游客继续
            </button>
            <button
              type="submit"
              disabled={busy !== null || !hubUrl.trim() || !username.trim() || !password}
              className="rounded-mesh bg-mesh-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {busy === 'login' ? '登录中…' : '登录'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
