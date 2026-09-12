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
import { LogoPreferenceProvider } from '@/lib/providers/logo-preference'
import { AuthProvider } from '@/features/auth'
import { AuthRouterBridge } from '@/features/auth/components/auth-router-bridge'
import { WatchlistSyncPrompt } from '@/features/auth/components/watchlist-sync-prompt'
import { FeatureProvider } from '@/features/_config'
import { PageMetaProvider } from '@/lib/providers/page-context'
import { PlexAudioProvider } from '@/lib/player/plex-audio-provider'
import { PlayerProvider } from '@/lib/player/use-player'
import { DkToastProvider, showErrorToast } from '@/old-features/ui/molecules/toast'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { getDesktopPlatform } from '@/lib/desktop/platform'
import { ACCESS_TOKEN_KEY } from '@/lib/config'
import './index.css'

// Set desktop platform attribute for CSS targeting
const plat = getDesktopPlatform()
if (plat.isDesktop && plat.platform) {
  document.documentElement.setAttribute('data-desktop-platform', plat.platform)
}

// Global unhandled promise rejection handler — displays error toast
window.addEventListener('unhandledrejection', (event) => {
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
  if (event.error) {
    showErrorToast(event.error, 'Application Error')
  } else if (event.message) {
    showErrorToast(event.message, 'Application Error')
  }
})

const hasToken = !!localStorage.getItem(ACCESS_TOKEN_KEY)

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
              <LogoPreferenceProvider>
                <FeatureProvider>
                <AuthProvider>
                  <AuthRouterBridge />
                  <WatchlistSyncPrompt />
                  <DkToastProvider>
                    <PlexAudioProvider>
                      <PlayerProvider>
                        <PageMetaProvider>
                          <ModalProvider>
                            <RouterProvider router={router} context={{ queryClient, isAuthenticated: false, isAuthLoaded: !hasToken }} />
                            <ModalRoot />
                          </ModalProvider>
                        </PageMetaProvider>
                      </PlayerProvider>
                    </PlexAudioProvider>
                  </DkToastProvider>
              </AuthProvider>
              </FeatureProvider>
              </LogoPreferenceProvider>
            </ThemeProvider>
          </MotionPreferenceProvider>
        </ShaderQualityProvider>
      </PersistQueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
)
