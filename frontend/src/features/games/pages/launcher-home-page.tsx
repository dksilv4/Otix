import { Helmet } from 'react-helmet-async'
import { Outlet } from '@tanstack/react-router'
import { QueryErrorBoundary } from '@/components/query-error-boundary'
import { FloatingGameSelector } from '@/features/games/molecules/floating-game-selector'
import { WebPreviewBanner } from '@/features/games/molecules/web-preview-banner'

export function LauncherHomePage() {
  return (
    <QueryErrorBoundary label="launcher">
      <div id="launcher-root" className="w-full h-screen bg-[#0a0a0d] text-white relative shadow-[0_24px_50px_rgba(0,0,0,0.85)] font-sans select-none">
        <Helmet><title>Games · Otix</title></Helmet>
        <WebPreviewBanner />
        <FloatingGameSelector />
        <Outlet />
      </div>
    </QueryErrorBoundary>
  )
}
