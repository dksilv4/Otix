import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { HelmetProvider } from 'react-helmet-async'
import { queryClient } from '@/lib/query-client'
import { router } from '@/lib/router'
import { ThemeProvider } from '@/lib/theme'
import { AuthProvider } from '@/features/auth'
import { PageMetaProvider } from '@/lib/page-context'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <PageMetaProvider>
              <RouterProvider router={router} />
            </PageMetaProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
)
