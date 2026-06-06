// TODO: Review this file
import { QueryClient } from '@tanstack/react-query'
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'

const CACHE_BUSTER = 'v2'
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
      gcTime: 1000 * 60 * 10, // 10 minutes (was 30 — reduced to keep localStorage smaller)
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

// Approximate max size for a single persisted query (50 KB). Skip queries
// whose serialized data exceeds this to prevent localStorage bloat from
// large result sets (e.g., infinite-scroll pages).
const MAX_QUERY_SIZE = 50_000

export const persistOptions = {
  persister: createLocalStoragePersister(),
  maxAge: 1000 * 60 * 60 * 24, // 24 hours max persistence age
  buster: CACHE_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { state: { data: unknown; status: string }; queryKey: readonly unknown[] }) => {
      if (query.state.status !== 'success' || query.state.data == null) return false
      // Skip infinite queries — their page arrays grow unbounded
      if (query.queryKey.includes('infinite')) return false
      // Skip large queries to keep localStorage lean
      try {
        const size = JSON.stringify(query.state.data).length
        if (size > MAX_QUERY_SIZE) return false
      } catch {
        return false
      }
      return true
    },
  },
}
