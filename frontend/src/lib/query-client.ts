import { QueryClient } from '@tanstack/react-query'
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'

const CACHE_BUSTER = 'v1'
const STORAGE_KEY = `otix_query_cache_${CACHE_BUSTER}`

function createLocalStoragePersister(): Persister {
  return {
    persistClient(persistedClient: PersistedClient) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedClient))
      } catch {
        // Storage full or unavailable — silently ignore
      }
    },
    restoreClient() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return undefined
        return JSON.parse(raw) as PersistedClient
      } catch {
        window.localStorage.removeItem(STORAGE_KEY)
        return undefined
      }
    },
    removeClient() {
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      } catch {
        // ignore
      }
    },
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: false,
      networkMode: 'always',
    },
    mutations: {
      retry: 0,
    },
  },
})

export const persistOptions = {
  persister: createLocalStoragePersister(),
  maxAge: Infinity,
  buster: CACHE_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { state: { data: unknown; status: string } }) =>
      query.state.status === 'success' && query.state.data != null,
  },
}
