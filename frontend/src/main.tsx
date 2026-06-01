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
