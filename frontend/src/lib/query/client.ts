// TODO: Review this file
import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query'
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'
import { getDesktopAPI } from '../desktop/api'
import { showErrorToast } from '@ui/molecules/toast'
import { reportNetworkFailure, reportOnline } from '@/lib/offline'
import { isAuthSessionError } from '@/lib/api/session-refresh'
import { isEmptyQueryData } from './empty-cache'

const CACHE_BUSTER = 'v4'
const STORAGE_KEY = `otix_query_cache_${CACHE_BUSTER}`

function createElectronPersister(): Persister {
  let _cache: PersistedClient | undefined
  let _load: Promise<PersistedClient | undefined> | undefined

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
    async restoreClient() {
      if (_cache) return _cache
      const api = getDesktopAPI()
      if (api?.cacheLoad) {
        _load ??= api.cacheLoad()
          .then((data) => {
            if (data) _cache = data as PersistedClient
            return _cache
          })
          .catch(() => undefined)
        const disk = await _load
        if (disk) return disk
      }
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw) { _cache = JSON.parse(raw) as PersistedClient; return _cache }
      } catch { window.localStorage.removeItem(STORAGE_KEY) }
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

export function shouldToastQueryError(
  error: unknown,
  query: { meta?: { suppressToast?: unknown }; state: { data: unknown } },
): boolean {
  if (query.meta?.suppressToast) return false
  if (isAuthSessionError(error)) return false
  // Background refetch: keep cached Radarr/Plex/session data on screen.
  // A 502 while the API reloads would otherwise toast every poll.
  if (query.state.data !== undefined) return false
  return true
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      reportNetworkFailure(error)
      if (!shouldToastQueryError(error, query)) return
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
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24,
      retry: (failureCount, error) => {
        if (isAuthSessionError(error)) return false
        return failureCount < 1
      },
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchOnReconnect: true,
      networkMode: 'always',
    },
    mutations: {
      retry: 0,
    },
  },
})

const MAX_QUERY_SIZE = 50_000

export function shouldPersistQuery(query: {
  state: { data: unknown; status: string }
  queryKey: readonly unknown[]
}): boolean {
  try {
    if (query.state.status !== 'success' || query.state.data == null) return false
    if (query.queryKey.includes('infinite')) return false
    if (isEmptyQueryData(query.state.data)) return false
    const size = JSON.stringify(query.state.data).length
    if (size > MAX_QUERY_SIZE) return false
    return true
  } catch {
    return false
  }
}

export const persistOptions = {
  persister: typeof window !== 'undefined' && !!getDesktopAPI()
    ? createElectronPersister()
    : createLocalStoragePersister(),
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  buster: CACHE_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: shouldPersistQuery,
  },
}
