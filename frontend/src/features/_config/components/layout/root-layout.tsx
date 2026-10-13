import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react"
import { Outlet, useLocation } from "@tanstack/react-router"
import { NavShell } from "@navigation"
import { TitleBar } from "./title-bar"
import { XPToastContainer } from "@ui/atoms/xp-toast"
import { CommandPaletteMount } from "@/features/hub"
import { PanelProvider } from "@activity/providers/panel-context"
import { NotificationsProvider } from "@/features/notifications/providers/notifications-provider"
import { CatalogStreamProvider } from "@/features/media/providers/catalog-stream-provider"
import { usePluginPermissions } from "@/features/plugins/hooks/use-plugin-permissions"
import { useModal, ModalRoot } from "@/lib/modals"
import { DecideWatchHost } from "@/features/discover/components/organisms/decide-watch-host"
import { LevelUpHost } from "@user/components/organisms/level-up-host"
import { GamingXpHost } from "@/features/launcher"
import { IndexerSearchHost } from "@/features/downloads/molecules/indexer-search-host"
import { CookieBanner } from "@/components/cookie-banner"
import { AppMicroFooter } from "@/components/app-micro-footer"

const ActivityModule = lazy(() =>
  import("@activity/components/organisms/activity-panel").then((m) => ({ default: m.ActivityModule })),
)
const PluginPermissionModal = lazy(() =>
  import("@/features/plugins/components/organisms/plugin-permission-modal").then((m) => ({
    default: m.PluginPermissionModal,
  })),
)

import { loadPinState } from "../../utils"

export const RootLayout = () => {
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

  const isFullScreenPage =
    location.pathname.startsWith('/launcher') ||
    location.pathname.startsWith('/game') ||
    location.pathname.startsWith('/settings') ||
    location.pathname.startsWith('/auth') ||
    location.pathname.startsWith('/calendar/timeline')

  return (
    <div className="min-h-screen w-full max-w-[100vw] bg-[var(--background)]">
      <TitleBar />

      <PanelProvider>
        <NotificationsProvider>
          <CatalogStreamProvider>
          <NavShell isPinned={isPinned} isSidebarOpen={isSidebarOpen} onToggleSidebar={handleToggleSidebar}>
            <main className={isFullScreenPage ? "" : "pt-16 md:pt-20 flex flex-col min-h-screen"}>
              <div className="flex-1">
                <Outlet />
              </div>
              {!isFullScreenPage &&
                !location.pathname.startsWith('/terms') && <AppMicroFooter />}
            </main>
          </NavShell>

          <XPToastContainer />
          <Suspense fallback={null}>
            <ActivityModule open={isSidebarOpen} onClose={handleCloseSidebar} />
          </Suspense>
          </CatalogStreamProvider>
        </NotificationsProvider>
      </PanelProvider>
      <CommandPaletteMount />
      <DecideWatchHost />
      <LevelUpHost />
      <GamingXpHost />
      <IndexerSearchHost />
      <ModalRoot />
      <CookieBanner />
    </div>
  )
};
