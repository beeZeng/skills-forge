import { useState, type FormEvent } from 'react'
import { useAppStore } from '@/stores/app-store'

export function LoginModal() {
  const open = useAppStore((s) => s.loginOpen)
  const setLoginOpen = useAppStore((s) => s.setLoginOpen)
  const login = useAppStore((s) => s.login)
  const panguHubUrl = useAppStore((s) => s.panguHubUrl)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const result = await login({ username: username.trim(), password })
    setBusy(false)
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
            <p className="mt-1 text-[11px] text-mesh-dim">Hub：{panguHubUrl}</p>
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
              disabled={busy || !username.trim() || !password}
              className="rounded-mesh bg-mesh-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {busy ? '登录中…' : '登录'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
