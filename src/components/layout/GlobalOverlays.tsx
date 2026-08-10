import { SkillDrawer } from '@/components/drawer/SkillDrawer'
import { ToastHost } from '@/components/ToastHost'
import { LoginModal } from '@/components/auth/LoginModal'

/** Shared overlays used by both Hub home and AppShell. */
export function GlobalOverlays() {
  return (
    <>
      <SkillDrawer />
      <ToastHost />
      <LoginModal />
    </>
  )
}
