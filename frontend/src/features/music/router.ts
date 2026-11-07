import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'

const MusicPage = safeLazy(() =>
  import('./pages/music-page').then((m) => ({ default: m.MusicPage })),
)

export const createMusicRoutes = (rootRoute: AnyRoute) => {
  const musicRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/music',
    component: MusicPage,
    loader: () => {
      safePrefetchChunk(() => import('./pages/music-page'))
    },
  })

  return [musicRoute]
}
