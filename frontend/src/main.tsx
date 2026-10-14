// TODO: Review this file
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { RouterProvider } from '@tanstack/react-router'
import { HelmetProvider } from 'react-helmet-async'
import { queryClient, persistOptions } from '@/lib/query/client'
import { router } from '@/lib/router'
import { ShaderQualityProvider } from '@/lib/providers/shader-quality'
import { MotionPreferenceProvider } from '@/lib/providers/motion-preference'
import { ThemeProvider } from '@/lib/providers/theme'
import { AuthProvider } from '@/features/auth/providers/auth-provider'
import { AuthRouterBridge } from '@/features/auth/components/auth-router-bridge'
import { AuthGate } from '@/features/auth/components/auth-gate'
import { WatchlistSyncPrompt } from '@/features/auth/components/watchlist-sync-prompt'
import { FeatureProvider } from '@/features/_config'
import { PageMetaProvider } from '@/lib/providers/page-context'
import { PlexAudioProvider } from '@/lib/player/plex-audio-provider'
import { JellyfinAudioProvider } from '@/lib/player/jellyfin-audio-provider'
import { PlayerProvider } from '@/lib/player/use-player'
import { MediaStreamPlayerProvider } from '@/features/media/hooks/use-media-stream-player'
import { MediaStreamPlayerModal } from '@/features/media/components/organisms/media-stream-player-modal'
import { DkToastProvider, showErrorToast } from '@ui/molecules/toast'
import { ModalProvider } from '@/lib/modals'
import { ContextMenuProvider, ContextMenuPortal } from '@/features/_config/context-menu'
import { getDesktopPlatform } from '@/lib/desktop/platform'
import './index.css'

import { isChunkLoadError, reloadForNewChunk } from '@/lib/utils/chunk-reload'

// Clean up cache-busting reload query param if present
if (typeof window !== 'undefined' && window.location.search.includes('otix_reload=')) {
  const cleanUrl = new URL(window.location.href)
  cleanUrl.searchParams.delete('otix_reload')
  window.history.replaceState({}, '', cleanUrl.pathname + (cleanUrl.search || '') + cleanUrl.hash)
}

// Set desktop platform attribute for CSS targeting
const plat = getDesktopPlatform()
if (plat.isDesktop && plat.platform) {
  document.documentElement.setAttribute('data-desktop-platform', plat.platform)
}

// Vite preload error — fired when a dynamic import chunk fails to load after a deployment
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  reloadForNewChunk()
})

// Global unhandled promise rejection handler — displays error toast
window.addEventListener('unhandledrejection', (event) => {
  if (isChunkLoadError(event.reason)) {
    event.preventDefault()
    reloadForNewChunk()
    return
  }

  const msg = String(event.reason?.message || event.reason || '')
  if (
    msg.includes('EMEError') ||
    msg.includes('No supported keysystem') ||
    msg.includes('requestMediaKeySystemAccess') ||
    msg.includes('send was called before connect') ||
    msg.includes('canceled') ||
    msg.includes('cancelled')
  ) {
    event.preventDefault()
    return
  }

  showErrorToast(event.reason, 'Unhandled Promise Rejection')
})

// Global unhandled script error handler — displays error toast
window.addEventListener('error', (event) => {
  if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
    event.preventDefault()
    reloadForNewChunk()
    return
  }

  if (event.error) {
    showErrorToast(event.error, 'Application Error')
  } else if (event.message) {
    showErrorToast(event.message, 'Application Error')
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={persistOptions}
      >
        <ShaderQualityProvider>
          <MotionPreferenceProvider>
            <ThemeProvider>
              <FeatureProvider>
                <AuthProvider>
                  <AuthRouterBridge />
                  <AuthGate>
                    <WatchlistSyncPrompt />
                    <DkToastProvider>
                      <PlexAudioProvider>
                        <JellyfinAudioProvider>
                          <PlayerProvider>
                            <MediaStreamPlayerProvider>
                              <PageMetaProvider>
                                <ContextMenuProvider>
                                  <ModalProvider>
                                    <RouterProvider
                                      router={router}
                                      context={{ queryClient, isAuthenticated: false, isAuthLoaded: false }}
                                    />
                                    <MediaStreamPlayerModal />
                                  </ModalProvider>
                                  <ContextMenuPortal />
                                </ContextMenuProvider>
                              </PageMetaProvider>
                            </MediaStreamPlayerProvider>
                          </PlayerProvider>
                        </JellyfinAudioProvider>
                      </PlexAudioProvider>
                    </DkToastProvider>
                  </AuthGate>
                </AuthProvider>
              </FeatureProvider>
            </ThemeProvider>
          </MotionPreferenceProvider>
        </ShaderQualityProvider>
      </PersistQueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
)
