import { useState, useCallback } from "react"
import { Outlet } from "@tanstack/react-router"
import { NavShell } from "@navigation"
import { TitleBar } from "@/old-features/title-bar/organisms/title-bar"
import { XPToastContainer } from "@/old-features/dk-ui/atoms/xp-toast"
import { ActivityModule } from "@activity/components/organisms/activity-panel"
import { useNotificationToasts } from "../../hooks/use-notification-toasts"
import { PanelProvider } from "@activity/providers/panel-context"
import { usePluginPermissions } from "@settings/hooks/usePluginPermissions"
import { PluginPermissionModal } from "@settings/components/PluginPermissionModal"

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

  const handleToggleSidebar = useCallback(() => setIsSidebarOpen((prev) => !prev), [])
  const handleCloseSidebar = useCallback(() => setIsSidebarOpen(false), [])

  const {
    currentRequest,
    handleAllowOnce,
    handleAllowAlways,
    handleDeny,
    isModalOpen,
  } = usePluginPermissions()

  useNotificationToasts()

  return (
    <div className="min-h-screen w-full max-w-[100vw] bg-[var(--background)]">
      <TitleBar />

      <PanelProvider>
        <NavShell isPinned={isPinned} isSidebarOpen={isSidebarOpen} onToggleSidebar={handleToggleSidebar}>
          <main className="">
            <Outlet />
          </main>
        </NavShell>

        <XPToastContainer />
        <ActivityModule open={isSidebarOpen} onClose={handleCloseSidebar} />
      </PanelProvider>

      <PluginPermissionModal
        request={isModalOpen ? currentRequest : null}
        onAllowOnce={(id) => handleAllowOnce()}
        onAllowAlways={(id) => handleAllowAlways()}
        onDeny={(id) => handleDeny()}
      />
    </div>
  )
}
