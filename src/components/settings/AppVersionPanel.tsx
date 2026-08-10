import { useEffect, useState } from 'react'
import { PathReveal } from '@/components/common/PathReveal'

type VersionInfo = Awaited<ReturnType<NonNullable<Window['skillMesh']>['app']['getVersionInfo']>>

export function AppVersionPanel() {
  const [info, setInfo] = useState<VersionInfo | null>(null)
  const desktop = !!window.skillMesh?.app?.getVersionInfo

  useEffect(() => {
    const api = window.skillMesh?.app?.getVersionInfo
    if (!api) return
    void api().then((res) => {
      if (res?.ok) setInfo(res)
    })
  }, [])

  if (!desktop) {
    return (
      <section className="rounded-mesh border border-mesh-border bg-mesh-card/40 p-4">
        <h2 className="text-sm font-semibold">应用版本</h2>
        <p className="mt-2 text-xs text-mesh-dim">浏览器预览无法读取桌面客户端版本。</p>
      </section>
    )
  }

  return (
    <section className="rounded-mesh border border-mesh-border bg-mesh-card/40 p-4">
      <h2 className="text-sm font-semibold">应用版本</h2>

      <div className="mt-3 rounded-md border border-mesh-border bg-mesh-panel/50 px-3 py-2.5">
        <div className="text-[11px] text-mesh-dim">当前版本</div>
        <div className="mt-0.5 font-mono text-sm">{info?.current || '—'}</div>
      </div>

      <div className="mt-4 space-y-2 border-t border-mesh-border pt-3">
        <PathReveal label="程序目录" path={info?.programPath} />
        <PathReveal label="用户数据" path={info?.dataRoot || info?.userDataPath} />
      </div>
    </section>
  )
}
