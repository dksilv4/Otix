// TODO: Review this file
import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query'
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'
import { getDesktopAPI } from '../desktop/api'
import { showErrorToast } from '@/old-features/ui/molecules/toast'
import { reportNetworkFailure, reportOnline } from '@/lib/offline'
import { isAuthSessionError } from '@/lib/api/session-refresh'

const CACHE_BUSTER = 'v3'
const STORAGE_KEY = `otix_query_cache_${CACHE_BUSTER}`

function createElectronPersister(): Persister {
  let _cache: PersistedClient | undefined

  return {
    persistClient(client: PersistedClient) {
      _cache = client
      const api = getDesktopAPI()
      if (api?.cacheSave) {
        api.cacheSave(client).catch(() => {})
      } else {
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(client)) } catch {}
      }
    },
    restoreClient() {
      if (_cache) return _cache
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw) { _cache = JSON.parse(raw) as PersistedClient; return _cache }
      } catch { window.localStorage.removeItem(STORAGE_KEY) }
      const api = getDesktopAPI()
      if (api?.cacheLoad) {
        api.cacheLoad().then((data) => {
          if (data) { _cache = data as PersistedClient; return }
        }).catch(() => {})
      }
      return _cache
    },
    removeClient() {
      _cache = undefined
      try { window.localStorage.removeItem(STORAGE_KEY) } catch {}
    },
  }
}

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
  queryCache: new QueryCache({
    onError: (error, query) => {
      reportNetworkFailure(error)
      if (query.meta?.suppressToast) return
      if (isAuthSessionError(error)) return
      showErrorToast(error, 'Query Error')
    },
    onSuccess: () => reportOnline(),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      reportNetworkFailure(error)
      if (mutation.meta?.suppressToast) return
      if (isAuthSessionError(error)) return
      showErrorToast(error, 'Operation Failed')
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes
      retry: (failureCount, error) => {
        if (isAuthSessionError(error)) return false
        return failureCount < 1
      },
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

const MAX_QUERY_SIZE = 50_000

export const persistOptions = {
  persister: typeof window !== 'undefined' && !!getDesktopAPI()
    ? createElectronPersister()
    : createLocalStoragePersister(),
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  buster: CACHE_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { state: { data: unknown; status: string }; queryKey: readonly unknown[] }) => {
      if (query.state.status !== 'success' || query.state.data == null) return false
      if (query.queryKey.includes('infinite')) return false
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
