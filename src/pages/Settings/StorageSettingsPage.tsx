import { useAppStore } from '@/stores/app-store'

export function StorageSettingsPage() {
  const used = useAppStore((s) => s.storageUsedGb)
  const total = useAppStore((s) => s.storageTotalGb)
  const installed = useAppStore((s) => s.skills.filter((s) => s.installed).length)
  const clearStorageCache = useAppStore((s) => s.clearStorageCache)

  return (
    <div className="mx-auto max-w-[760px] space-y-4">
      <div>
        <h1 className="text-xl font-semibold">存储管理</h1>
        <p className="mt-1 text-sm text-mesh-dim">本地仓库根目录：~/.skillmesh/</p>
      </div>
      <div className="rounded-mesh border border-mesh-border bg-mesh-card p-5">
        <div className="flex justify-between text-sm">
          <span>已用空间</span>
          <span>
            {used} GB / {total} GB
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-mesh-panel">
          <div className="h-full rounded-full bg-mesh-accent" style={{ width: `${(used / total) * 100}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-mesh bg-mesh-panel p-3">
            <div className="text-mesh-dim">已安装 Skill</div>
            <div className="mt-1 text-lg font-semibold">{installed}</div>
          </div>
          <div className="rounded-mesh bg-mesh-panel p-3">
            <div className="text-mesh-dim">缓存 / 日志</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-lg font-semibold">可清理</span>
              <button
                type="button"
                onClick={clearStorageCache}
                className="rounded-md border border-mesh-border px-2.5 py-1 text-xs hover:bg-mesh-card"
              >
                清理缓存
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
