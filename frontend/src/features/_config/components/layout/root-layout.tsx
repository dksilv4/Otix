import { useState, useCallback, useEffect, useRef } from "react"
import { Outlet, useLocation } from "@tanstack/react-router"
import { NavShell } from "@navigation"
import { TitleBar } from "@/old-features/title-bar/organisms/title-bar"
import { XPToastContainer } from "@/old-features/ui/atoms/xp-toast"
import { ContextMenuProvider, ContextMenuPortal } from "@/features/_config/context-menu"
import { CommandPaletteMount } from "@/features/hub"
import { ActivityModule } from "@activity/components/organisms/activity-panel"
import { PanelProvider } from "@activity/providers/panel-context"
import { NotificationsProvider } from "@/features/notifications/providers/notifications-provider"
import { usePluginPermissions } from "@/features/plugins/hooks/use-plugin-permissions"
import { PluginPermissionModal } from "@/features/plugins/components/organisms/plugin-permission-modal"
import { useModal } from "@/lib/modals"

const PIN_KEY = "otix_spotify_player_pinned"

function loadPinState(): boolean {
  try {
    return localStorage.getItem(PIN_KEY) === "true"
  } catch {
    return false
  }
}

export function RootLayout() {
  const isPinned = loadPinState()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const location = useLocation()

  const handleToggleSidebar = useCallback(() => setIsSidebarOpen((prev) => !prev), [])
  const handleCloseSidebar = useCallback(() => setIsSidebarOpen(false), [])

  const {
    currentRequest,
    handleAllowOnce,
    handleAllowAlways,
    handleDeny,
    handleClose,
  } = usePluginPermissions()

  const { openModal } = useModal()
  const closeRef = useRef<(() => void) | null>(null)

  // Open/close permission modal when request arrives/dismisses
  useEffect(() => {
    if (currentRequest) {
      closeRef.current = openModal(
        <PluginPermissionModal
          request={currentRequest}
          onAllowOnce={handleAllowOnce}
          onAllowAlways={handleAllowAlways}
          onDeny={handleDeny}
          onClose={handleClose}
        />,
      )
    } else {
      closeRef.current?.()
      closeRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRequest])

  const isFullScreenPage = location.pathname.startsWith('/launcher') || location.pathname.startsWith('/game') || location.pathname.startsWith('/settings') || location.pathname.startsWith('/auth')

  return (
    <div className="min-h-screen w-full max-w-[100vw] bg-[var(--background)]">
      <TitleBar />

      <ContextMenuProvider>
        <PanelProvider>
          <NotificationsProvider>
            <NavShell isPinned={isPinned} isSidebarOpen={isSidebarOpen} onToggleSidebar={handleToggleSidebar}>
              <main className={isFullScreenPage ? "" : "pt-16 md:pt-20"}>
                <Outlet />
              </main>
            </NavShell>

            <XPToastContainer />
            <ActivityModule open={isSidebarOpen} onClose={handleCloseSidebar} />
          </NotificationsProvider>
        </PanelProvider>
        <ContextMenuPortal />
        <CommandPaletteMount />
      </ContextMenuProvider>
    </div>
  )
}
