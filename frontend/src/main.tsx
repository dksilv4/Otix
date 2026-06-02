import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { RouterProvider } from '@tanstack/react-router'
import { HelmetProvider } from 'react-helmet-async'
import { queryClient, persistOptions } from '@/lib/query-client'
import { router } from '@/lib/router'
import { ShaderQualityProvider } from '@/lib/shader-quality'
import { MotionPreferenceProvider } from '@/lib/motion-preference'
import { ThemeProvider } from '@/lib/theme'
import { AuthProvider } from '@/features/auth'
import { ExperimentsProvider } from '@/features/experiments/experiments-provider'
import { PageMetaProvider } from '@/lib/page-context'
import { SpotifyPlayerProvider } from '@/features/spotify/spotify-player-provider'
import { PlexAudioProvider } from '@/features/spotify/plex-audio-provider'
import { PlayerProvider } from '@/features/spotify/use-player'
import { DkToastProvider } from '@/features/dk-ui/molecules/toast'
import './index.css'

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
    msg.includes('requestMediaKeySystemAccess')
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
              <AuthProvider>
                <ExperimentsProvider>
                  <DkToastProvider>
                    <SpotifyPlayerProvider>
                      <PlexAudioProvider>
                        <PlayerProvider>
                          <PageMetaProvider>
                            <RouterProvider router={router} context={{ queryClient }} />
                          </PageMetaProvider>
                        </PlayerProvider>
                      </PlexAudioProvider>
                    </SpotifyPlayerProvider>
                  </DkToastProvider>
                </ExperimentsProvider>
              </AuthProvider>
            </ThemeProvider>
          </MotionPreferenceProvider>
        </ShaderQualityProvider>
      </PersistQueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
)
