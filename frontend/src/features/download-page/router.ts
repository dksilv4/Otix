import { createRoute, redirect } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'
import { isDesktop } from '@/lib/desktop/api'

const DownloadPage = safeLazy(() =>
  import('./pages/download-page').then((m) => ({ default: m.DownloadPage })),
)

const DownloadQueuePage = safeLazy(() =>
  import('@/features/downloads/organisms/download-queue').then((m) => ({ default: m.DownloadQueuePage })),
)

export function createDownloadRoutes(rootRoute: AnyRoute) {
  const downloadsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/downloads',
    component: DownloadQueuePage,
    loader: () => {
      safePrefetchChunk(() => import('@/features/downloads/organisms/download-queue'))
    },
  })

  const downloadRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/download',
    beforeLoad: () => {
      if (isDesktop()) {
        throw redirect({ to: '/downloads' })
      }
    },
    component: DownloadPage,
    loader: () => {
      safePrefetchChunk(() => import('./pages/download-page'))
    },
  })

  return [downloadsRoute, downloadRoute]
}
