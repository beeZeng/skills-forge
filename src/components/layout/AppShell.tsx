import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { LoginModal } from '@/components/auth/LoginModal'
import { SkillDrawer } from '@/components/drawer/SkillDrawer'
import { ToastHost } from '@/components/ToastHost'
export function AppShell() {
  return (
    <div className="flex h-full overflow-hidden bg-mesh-bg text-mesh-text">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <Outlet />
        </main>
      </div>
      <SkillDrawer />
      <ToastHost />
      <LoginModal />
    </div>
  )
}
