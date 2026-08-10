import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { loadPersistedState } from '@/services/persistence'
import { useAppStore } from '@/stores/app-store'
import { HubHomePage } from '@/pages/Hub/HubHomePage'
import { DiscoverPage } from '@/pages/Skills/DiscoverPage'
import { MinePage } from '@/pages/Skills/MinePage'
import { PublishPage } from '@/pages/Publish/PublishPage'
import { TasksPage } from '@/pages/Tasks/TasksPage'
import { SourcesSettingsPage } from '@/pages/Settings/SourcesSettingsPage'
import { AgentsSettingsPage } from '@/pages/Settings/AgentsSettingsPage'
import { StorageSettingsPage } from '@/pages/Settings/StorageSettingsPage'
import { BrandMark } from '@/components/brand/BrandMark'
import { AdvancedSettingsPage } from '@/pages/Settings/AdvancedSettingsPage'
import { GuidePage } from '@/pages/Settings/GuidePage'

function Bootstrap() {
  const hydrate = useAppStore((s) => s.hydrate)
  const scanAgents = useAppStore((s) => s.scanAgents)
  const hydrated = useAppStore((s) => s.hydrated)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        let timedOut = false
        const persisted = await Promise.race([
          loadPersistedState(),
          new Promise<null>((resolve) =>
            setTimeout(() => {
              timedOut = true
              resolve(null)
            }, 1500),
          ),
        ])
        if (cancelled) return
        hydrate(persisted)
        if (timedOut && !persisted) {
          useAppStore.getState().showToast('配置加载超时，已使用默认设置', 'warning')
        }
        void scanAgents().catch(() => undefined)
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          hydrate(null)
          useAppStore.getState().showToast('配置加载失败，已使用默认设置', 'warning')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hydrate, scanAgents])

  if (!hydrated) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-mesh-bg text-mesh-text">
        <BrandMark className="h-14 w-14" />
        <div className="text-base font-bold tracking-tight">Nexus</div>
        <div className="text-sm text-mesh-muted">正在启动...</div>
      </div>
    )
  }

  return (
    <Routes>
      <Route index element={<Navigate to="/dashboard" replace />} />
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<HubHomePage />} />
        <Route path="/skills/mine" element={<MinePage />} />
        <Route path="/skills/create" element={<Navigate to="/skills/mine" replace />} />
        <Route path="/skills/discover" element={<DiscoverPage />} />
        <Route path="/skills/installed" element={<Navigate to="/skills/mine" replace />} />
        <Route path="/skills/packages" element={<Navigate to="/skills/mine" replace />} />
        <Route path="/publish" element={<PublishPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/settings/sources" element={<SourcesSettingsPage />} />
        <Route path="/settings/agents" element={<AgentsSettingsPage />} />
        <Route path="/settings/storage" element={<StorageSettingsPage />} />
        <Route path="/settings/advanced" element={<AdvancedSettingsPage />} />
        <Route path="/settings/guide" element={<GuidePage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Bootstrap />
    </HashRouter>
  )
}
