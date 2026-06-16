import { Helmet } from 'react-helmet-async'
import { Outlet } from '@tanstack/react-router'
import { QueryErrorBoundary } from '@/components/query-error-boundary'
import { FloatingGameSelector } from '@/features/launcher/molecules/floating-game-selector'
import { WebPreviewBanner } from '@/features/launcher/molecules/web-preview-banner'
import { FpsPermissionDialog } from '@/features/launcher/molecules/fps-permission-dialog'

export function LauncherHomePage() {
  return (
    <QueryErrorBoundary label="launcher">
      <div id="launcher-root" className="w-full h-screen bg-[#0a0a0d] text-white relative shadow-[0_24px_50px_rgba(0,0,0,0.85)] font-sans select-none">
        <Helmet><title>Launcher · Otix</title></Helmet>
        <WebPreviewBanner />
        <FloatingGameSelector />
        <FpsPermissionDialog />
        <Outlet />
      </div>
    </QueryErrorBoundary>
  )
}
