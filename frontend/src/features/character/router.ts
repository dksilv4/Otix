import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { characterQueries } from './queries/character-queries'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'

const CharacterDetailPage = safeLazy(() =>
  import('./pages/character-detail-page').then(m => ({ default: m.CharacterDetailPage })),
)

export function createCharacterRoutes(rootRoute: AnyRoute) {
  const characterDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/character/$characterId',
    component: CharacterDetailPage,
    loader: ({ context, params }) => {
      safePrefetchChunk(() => import('./pages/character-detail-page'))
      void context.queryClient.prefetchQuery(characterQueries.detail(params.characterId))
    },
  })

  return [characterDetailRoute]
}
