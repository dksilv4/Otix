import { QueryClient, QueryCache, MutationCache, hydrate, keepPreviousData } from '@tanstack/react-query'
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'
import { getDesktopAPI } from '../desktop/api'
import { showErrorToast } from '@ui/molecules/toast'
import { reportNetworkFailure, reportOnline } from '@/lib/offline'
import { isAuthSessionError } from '@/lib/api/session-refresh'
import { isEmptyQueryData } from './empty-cache'

const CACHE_BUSTER = 'v4'
const STORAGE_KEY = `otix_query_cache_${CACHE_BUSTER}`
const CACHE_RESTORE_BUDGET_MS = 1500
const CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7 // 7 days

function withBudget<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(undefined), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      () => {
        window.clearTimeout(timer)
        resolve(undefined)
      },
    )
  })
}

function getMaxQuerySize(): number {
  return getDesktopAPI() ? 5_000_000 : 500_000
}

function createElectronPersister(): Persister {
  let _cache: PersistedClient | undefined
  let _load: Promise<PersistedClient | undefined> | undefined
  let saveTimeout: ReturnType<typeof setTimeout> | null = null
  let pendingClient: PersistedClient | null = null

  const flush = () => {
    if (!pendingClient) return
    const toSave = pendingClient
    pendingClient = null
    saveTimeout = null
    _cache = toSave
    const api = getDesktopAPI()
    if (api?.cacheSave) {
      api.cacheSave(toSave).catch(() => undefined)
    }
    // In desktop mode, persistence is handled asynchronously via disk API (api.cacheSave).
    // Avoid writing multi-megabyte payloads to synchronous window.localStorage.
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
  }

  return {
    persistClient(client: PersistedClient) {
      pendingClient = client
      if (saveTimeout !== null) clearTimeout(saveTimeout)
      saveTimeout = setTimeout(flush, 500)
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
        const disk = await withBudget(_load, CACHE_RESTORE_BUDGET_MS)
        if (disk) return disk
      }
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw) { _cache = JSON.parse(raw) as PersistedClient; return _cache }
      } catch { window.localStorage.removeItem(STORAGE_KEY) }
      return _cache
    },
    removeClient() {
      if (saveTimeout !== null) {
        clearTimeout(saveTimeout)
        saveTimeout = null
      }
      pendingClient = null
      _cache = undefined
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Ignore storage failures while clearing the cache.
      }
    },
  }
}

function createLocalStoragePersister(): Persister {
  let saveTimeout: ReturnType<typeof setTimeout> | null = null
  let pendingClient: PersistedClient | null = null

  const flush = () => {
    if (!pendingClient) return
    const toSave = pendingClient
    pendingClient = null
    saveTimeout = null
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch {
      // Storage full or unavailable — silently ignore
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
  }

  return {
    persistClient(persistedClient: PersistedClient) {
      pendingClient = persistedClient
      if (saveTimeout !== null) clearTimeout(saveTimeout)
      saveTimeout = setTimeout(flush, 500)
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
      if (saveTimeout !== null) {
        clearTimeout(saveTimeout)
        saveTimeout = null
      }
      pendingClient = null
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
      gcTime: CACHE_MAX_AGE,
      placeholderData: keepPreviousData,
      retry: (failureCount, error) => {
        if (isAuthSessionError(error)) return false
        return failureCount < 1
      },
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: true,
      networkMode: 'always',
    },
    mutations: {
      retry: 0,
    },
  },
})

export function serializeQueryData(data: unknown): unknown {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (Array.isArray(record.pages) && record.pages.length > 2) {
      return {
        ...record,
        pages: record.pages.slice(0, 2),
        pageParams: Array.isArray(record.pageParams) ? record.pageParams.slice(0, 2) : record.pageParams,
      }
    }
  }
  return data
}

export function shouldPersistQuery(query: {
  state: { data: unknown; status: string }
  queryKey: readonly unknown[]
}): boolean {
  try {
    if (query.state.status !== 'success' || query.state.data == null) return false
    const key = query.queryKey
    if (key.includes('queue') || key.includes('pending') || key.includes('fps')) return false
    if (key[0] === 'game-servers' || key[0] === 'games-detail') return false
    if (key[0] === 'local-games' && key[1] === 'detail') return false
    if (key[0] === 'media' && key[1] === 'detail') return false
    if (key[0] === 'library' && key[1] === 'detail') return false
    if (isEmptyQueryData(query.state.data)) return false
    // Structural key exclusion prevents huge blobs from being persisted.
    // Avoid JSON.stringify(query.state.data).length which froze the main thread for 6.5s.
    return true
  } catch {
    return false
  }
}

export const persistOptions = {
  persister: typeof window !== 'undefined' && !!getDesktopAPI()
    ? createElectronPersister()
    : createLocalStoragePersister(),
  maxAge: CACHE_MAX_AGE,
  buster: CACHE_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: shouldPersistQuery,
    serializeData: serializeQueryData,
  },
}

let hasHydratedSync = false

// Purge any historical multi-megabyte localStorage caches left by previous versions
if (typeof window !== 'undefined') {
  try {
    const isDesktopEnv = Boolean(getDesktopAPI())
    if (isDesktopEnv) {
      window.localStorage.removeItem(STORAGE_KEY)
      window.localStorage.removeItem('otix_query_cache_v4')
      window.localStorage.removeItem('otix_query_cache_v3')
      window.localStorage.removeItem('otix_query_cache')
    }
  } catch {
    // Ignore storage errors during cleanup
  }
}

export function restoreSyncFromLocalStorage(): boolean {
  if (typeof window === 'undefined') return false
  if (getDesktopAPI()) return false // Desktop loads asynchronously via disk cacheLoad
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const persisted = JSON.parse(raw) as PersistedClient
    if (
      persisted?.clientState &&
      persisted.timestamp &&
      Date.now() - persisted.timestamp <= CACHE_MAX_AGE &&
      persisted.buster === CACHE_BUSTER
    ) {
      hydrate(queryClient, persisted.clientState)
      hasHydratedSync = true
      return true
    }
  } catch {
    // Ignore parse or storage issues
  }
  return false
}

// Deferred initialization: do not execute heavy JSON.parse on module evaluation

export async function restorePersistedCache(): Promise<void> {
  const api = getDesktopAPI()
  if (api?.cacheLoad) {
    try {
      const diskClient = (await withBudget(api.cacheLoad() as Promise<PersistedClient | null>, CACHE_RESTORE_BUDGET_MS)) as PersistedClient | null | undefined
      if (
        diskClient?.clientState &&
        diskClient.timestamp &&
        Date.now() - diskClient.timestamp <= CACHE_MAX_AGE &&
        diskClient.buster === CACHE_BUSTER
      ) {
        hydrate(queryClient, diskClient.clientState)
        return
      }
    } catch {
      // fallback to sync local storage below
    }
  }
  if (!hasHydratedSync) {
    restoreSyncFromLocalStorage()
  }
}
