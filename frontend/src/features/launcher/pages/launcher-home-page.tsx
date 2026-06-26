import { Helmet } from 'react-helmet-async'
import { Outlet } from '@tanstack/react-router'
import { QueryErrorBoundary } from '@/components/query-error-boundary'
import { FloatingGameSelector } from '@/features/launcher/components/molecules/launcher-floating-game-selector'
import { WebPreviewBanner } from '@/features/launcher/components/molecules/launcher-web-preview-banner'
import { FpsPermissionDialog } from '@/features/launcher/components/molecules/launcher-fps-permission-dialog'
import { useHydrateLocalGames } from '@/features/launcher/hooks/use-launcher-hydrate'
import { LauncherThemeProvider } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherHomePage() {
  useHydrateLocalGames()
  return (
    <LauncherThemeProvider>
      <QueryErrorBoundary label="launcher">
        <div id="launcher-root" className="w-full h-screen bg-[#0a0a0d] text-white relative shadow-[0_24px_50px_rgba(0,0,0,0.85)] font-sans select-none">
          <Helmet><title>Launcher · Otix</title></Helmet>
          <WebPreviewBanner />
          <FloatingGameSelector />
          <FpsPermissionDialog />
          <Outlet />
        </div>
      </QueryErrorBoundary>
    </LauncherThemeProvider>
  )
}
