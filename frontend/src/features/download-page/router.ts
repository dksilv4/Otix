import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'

const DownloadPage = safeLazy(() =>
  import('./pages/download-page').then((m) => ({ default: m.DownloadPage })),
)

export function createDownloadRoutes(rootRoute: AnyRoute) {
  const downloadsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/downloads',
    component: DownloadPage,
    loader: () => {
      safePrefetchChunk(() => import('./pages/download-page'))
    },
  })

  const downloadRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/download',
    component: DownloadPage,
    loader: () => {
      safePrefetchChunk(() => import('./pages/download-page'))
    },
  })

  return [downloadsRoute, downloadRoute]
}
