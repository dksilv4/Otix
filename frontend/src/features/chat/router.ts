import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'
import { chatQueries } from './queries'

const MessagesPage = safeLazy(() =>
  import('./pages/messages-page').then((m) => ({ default: m.MessagesPage })),
)

export function createChatRoutes(rootRoute: AnyRoute) {
  const messagesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/messages',
    component: MessagesPage,
    loader: ({ context }) => {
      safePrefetchChunk(() => import('./pages/messages-page'))
      void context.queryClient.prefetchQuery(chatQueries.conversations())
    },
  })

  return [messagesRoute]
}
