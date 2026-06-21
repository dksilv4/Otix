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
import { FeatureProvider } from '@/features/_config'
import { PageMetaProvider } from '@/lib/providers/page-context'
import { SpotifyPlayerProvider } from '@/old-features/spotify/spotify-player-provider'
import { PlexAudioProvider } from '@/old-features/spotify/plex-audio-provider'
import { PlayerProvider } from '@/old-features/spotify/use-player'
import { DkToastProvider } from '@/old-features/dk-ui/molecules/toast'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { getDesktopPlatform } from '@/lib/desktop/platform'
import './index.css'

// Set desktop platform attribute for CSS targeting
const plat = getDesktopPlatform()
if (plat.isDesktop && plat.platform) {
  document.documentElement.setAttribute('data-desktop-platform', plat.platform)
}

// Suppress noisy unhandled rejections from browser/environment that
// bubble as "Uncaught (in promise)" in the console. These are not
// actionable: they come from the browser's EME/CDM probing (common on
// Electron and some Chromium configurations) or from third-party
// integrations we don't control. Other rejections still appear.
window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event.reason ?? '')
  if (
    msg.includes('EMEError') ||
    msg.includes('No supported keysystem') ||
    msg.includes('requestMediaKeySystemAccess') ||
    msg.includes('send was called before connect')
  ) {
    event.preventDefault()
  }
})

// On Windows Electron the PlayReady CDM is often unavailable, which
// causes the Spotify Web Playback SDK to throw EMEError when it probes
// for key systems.  The Electron build now uses Spotify Connect REST
// API instead of the SDK, but keep the suppression for browser users.
// (This is harmless — it only catches what's already an unhandled
// rejection from the browser's own EME probing.)

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
                  <DkToastProvider>
                    <SpotifyPlayerProvider>
                      <PlexAudioProvider>
                        <PlayerProvider>
                          <PageMetaProvider>
                        <ModalProvider>
                          <RouterProvider router={router} context={{ queryClient }} />
                          <ModalRoot />
                        </ModalProvider>
                          </PageMetaProvider>
                        </PlayerProvider>
                      </PlexAudioProvider>
                    </SpotifyPlayerProvider>
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
