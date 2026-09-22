import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { characterQueries } from './queries/character-queries'

const CharacterDetailPage = lazy(() =>
  import('./pages/character-detail-page').then(m => ({ default: m.CharacterDetailPage })),
)

export function createCharacterRoutes(rootRoute: AnyRoute) {
  const characterDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/character/$characterId',
    component: CharacterDetailPage,
    loader: ({ context, params }) => {
      void import('./pages/character-detail-page')
      void context.queryClient.prefetchQuery(characterQueries.detail(params.characterId))
    },
  })

  return [characterDetailRoute]
}
