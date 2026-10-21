import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'

const DocsPage = safeLazy(() =>
  import('./pages/docs-page').then((m) => ({ default: m.DocsPage })),
)

export function createDocsRoutes(rootRoute: AnyRoute) {
  const docsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/docs',
    component: DocsPage,
    loader: () => {
      safePrefetchChunk(() => import('./pages/docs-page'))
    },
  })

  return [docsRoute]
}
