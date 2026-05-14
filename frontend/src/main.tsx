import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { HelmetProvider } from 'react-helmet-async'
import { queryClient } from '@/lib/query-client'
import { router } from '@/lib/router'
import { ShaderQualityProvider } from '@/lib/shader-quality'
import { MotionPreferenceProvider } from '@/lib/motion-preference'
import { ThemeProvider } from '@/lib/theme'
import { AuthProvider } from '@/features/auth'
import { PageMetaProvider } from '@/lib/page-context'
import { SpotifyPlayerProvider } from '@/features/spotify/spotify-player-provider'
import { DkToastProvider } from '@/features/dk-ui/molecules/toast'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ShaderQualityProvider>
          <MotionPreferenceProvider>
            <ThemeProvider>
              <AuthProvider>
                <DkToastProvider>
                  <SpotifyPlayerProvider>
                    <PageMetaProvider>
                      <RouterProvider router={router} />
                    </PageMetaProvider>
                  </SpotifyPlayerProvider>
                </DkToastProvider>
              </AuthProvider>
            </ThemeProvider>
          </MotionPreferenceProvider>
        </ShaderQualityProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
)
