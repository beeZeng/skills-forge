import { Outlet, useLocation } from 'react-router-dom'
import { NexusHeader } from './NexusHeader'
import { WorkspaceContainer } from './WorkspaceContainer'
import { GlobalOverlays } from './GlobalOverlays'

export function AppShell() {
  const { pathname } = useLocation()
  const isHubHome = pathname === '/dashboard'

  return (
    <div className="app-shell relative flex h-full flex-col overflow-hidden bg-mesh-bg text-mesh-text">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -left-[12%] top-[-18%] h-[42vh] w-[42vh] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.08),transparent_70%)] blur-2xl" />
        <div className="absolute -right-[10%] bottom-[-8%] h-[36vh] w-[36vh] rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.06),transparent_70%)] blur-2xl" />
      </div>

      <div className="relative z-20 shrink-0">
        <NexusHeader />
      </div>

      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto">
        {isHubHome ? (
          <Outlet />
        ) : (
          <WorkspaceContainer>
            <Outlet />
          </WorkspaceContainer>
        )}
      </main>

      <GlobalOverlays />
    </div>
  )
}
