import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react"
import { Outlet, useLocation } from "@tanstack/react-router"
import { NavShell } from "@navigation"
import { TitleBar } from "./title-bar"
import { XPToastContainer } from "@ui/atoms/xp-toast"
import { ContextMenuProvider, ContextMenuPortal } from "@/features/_config/context-menu"
import { CommandPaletteMount } from "@/features/hub"
import { PanelProvider } from "@activity/providers/panel-context"
import { NotificationsProvider } from "@/features/notifications/providers/notifications-provider"
import { CatalogStreamProvider } from "@/features/media/providers/catalog-stream-provider"
import { usePluginPermissions } from "@/features/plugins/hooks/use-plugin-permissions"
import { useModal } from "@/lib/modals"
import { useAuth } from "@/lib/providers/auth"
import { useAutoClaimPendingServers } from "@/features/downloads/use-server-downloads"

const ActivityModule = lazy(() =>
  import("@activity/components/organisms/activity-panel").then((m) => ({ default: m.ActivityModule })),
)
const PluginPermissionModal = lazy(() =>
  import("@/features/plugins/components/organisms/plugin-permission-modal").then((m) => ({
    default: m.PluginPermissionModal,
  })),
)

const PIN_KEY = "otix_player_pinned"

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
  const { isAuthenticated } = useAuth()
  useAutoClaimPendingServers(isAuthenticated)

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
        <Suspense fallback={null}>
          <PluginPermissionModal
            request={currentRequest}
            onAllowOnce={handleAllowOnce}
            onAllowAlways={handleAllowAlways}
            onDeny={handleDeny}
            onClose={handleClose}
          />
        </Suspense>,
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
            <CatalogStreamProvider>
            <NavShell isPinned={isPinned} isSidebarOpen={isSidebarOpen} onToggleSidebar={handleToggleSidebar}>
              <main className={isFullScreenPage ? "" : "pt-16 md:pt-20"}>
                <Outlet />
              </main>
            </NavShell>

            <XPToastContainer />
            <Suspense fallback={null}>
              <ActivityModule open={isSidebarOpen} onClose={handleCloseSidebar} />
            </Suspense>
            </CatalogStreamProvider>
          </NotificationsProvider>
        </PanelProvider>
        <ContextMenuPortal />
        <CommandPaletteMount />
      </ContextMenuProvider>
    </div>
  )
}
