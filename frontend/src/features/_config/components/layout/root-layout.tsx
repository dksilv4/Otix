import { useState, useCallback, useEffect, useRef, Suspense } from "react"
import { Outlet, useLocation } from "@tanstack/react-router"
import { NavShell } from "@navigation"
import { TitleBar } from "./title-bar"
import { XPToastContainer } from "@ui/atoms/xp-toast"
import { GlobalContextMenuListener } from "@/features/_config/context-menu"
import { PanelProvider } from "@activity/providers/panel-context"
import { NotificationsProvider } from "@/features/notifications/providers/notifications-provider"
import { CatalogStreamProvider } from "@/features/media/providers/catalog-stream-provider"
import { ChatProvider } from "@/features/chat"
import { usePluginPermissions } from "@/features/plugins/hooks/use-plugin-permissions"
import { useModal, ModalRoot } from "@/lib/modals"
import { CookieBanner } from "@/components/cookie-banner"
import { AppMicroFooter } from "@/components/app-micro-footer"
import { safeLazy } from "@/lib/utils/chunk-reload"

const CommandPaletteMount = safeLazy(() =>
  import("@/features/hub").then((m) => ({ default: m.CommandPaletteMount }))
)
const DecideWatchHost = safeLazy(() =>
  import("@/features/discover/components/organisms/decide-watch-host").then((m) => ({
    default: m.DecideWatchHost,
  }))
)
const FeatureSpotlightHost = safeLazy(() =>
  import("@/features/spotlight").then((m) => ({ default: m.FeatureSpotlightHost }))
)
const LevelUpHost = safeLazy(() =>
  import("@user/components/organisms/level-up-host").then((m) => ({ default: m.LevelUpHost }))
)
const GamingXpHost = safeLazy(() =>
  import("@/features/launcher").then((m) => ({ default: m.GamingXpHost }))
)
const IndexerSearchHost = safeLazy(() =>
  import("@/features/downloads/molecules/indexer-search-host").then((m) => ({
    default: m.IndexerSearchHost,
  }))
)
const GlobalMusicBar = safeLazy(() =>
  import("@/features/music/components/molecules/global-music-bar").then((m) => ({
    default: m.GlobalMusicBar,
  }))
)
const GlobalDropOverlay = safeLazy(() =>
  import("@/features/drop").then((m) => ({ default: m.GlobalDropOverlay }))
)
const UpdateNotificationToast = safeLazy(() =>
  import("@/features/updater").then((m) => ({ default: m.UpdateNotificationToast }))
)
const UpdateModal = safeLazy(() =>
  import("@/features/updater").then((m) => ({ default: m.UpdateModal }))
)
const ReleaseNotesModal = safeLazy(() =>
  import("@/features/updater").then((m) => ({ default: m.ReleaseNotesModal }))
)

const PluginPermissionModal = safeLazy(() =>
  import("@/features/plugins/components/organisms/plugin-permission-modal").then((m) => ({
    default: m.PluginPermissionModal,
  })),
)

import { loadPinState } from "../../utils"
import { useScrollRestoration } from "../../hooks/use-scroll-restoration"

export const RootLayout = () => {
  useScrollRestoration()
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

  const isInstallerPage =
    location.pathname.startsWith('/installer') ||
    location.pathname.startsWith('/uninstaller')

  if (isInstallerPage) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-transparent select-none">
        <Outlet />
        <ModalRoot />
      </div>
    )
  }

  const isFullScreenPage =
    location.pathname.startsWith('/launcher') ||
    location.pathname.startsWith('/game') ||
    location.pathname.startsWith('/settings') ||
    location.pathname.startsWith('/auth') ||
    location.pathname.startsWith('/calendar/timeline') ||
    location.pathname.startsWith('/messages')

  return (
    <div className="min-h-screen w-full max-w-[100vw] bg-[var(--background)]">
      <TitleBar />

      <PanelProvider>
        <NotificationsProvider>
          <CatalogStreamProvider>
            <ChatProvider>
              <NavShell
                isPinned={isPinned}
                isSidebarOpen={isSidebarOpen}
                onToggleSidebar={handleToggleSidebar}
                onCloseSidebar={handleCloseSidebar}
              >
                <main className={isFullScreenPage ? "" : "pt-16 md:pt-20 flex flex-col min-h-screen"}>
                  <div className="flex-1 min-h-screen">
                    <Outlet />
                  </div>
                  {!isFullScreenPage && <AppMicroFooter />}
                </main>
              </NavShell>

              <XPToastContainer />
            </ChatProvider>
          </CatalogStreamProvider>
        </NotificationsProvider>
      </PanelProvider>
      <GlobalContextMenuListener />
      <ModalRoot />
      <CookieBanner />
      <Suspense fallback={null}>
        <CommandPaletteMount />
        <DecideWatchHost />
        <FeatureSpotlightHost />
        <LevelUpHost />
        <GamingXpHost />
        <IndexerSearchHost />
        <GlobalMusicBar />
        <GlobalDropOverlay />
        <UpdateNotificationToast />
        <UpdateModal />
        <ReleaseNotesModal />
      </Suspense>
    </div>
  )
};
