import { lazy, type ComponentType } from 'react'

export const isChunkLoadError = (err: unknown): boolean => {
  if (!err) return false
  const msg = String((err as { message?: string })?.message || err)
  return (
    /failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /importing a module script failed/i.test(msg) ||
    /unable to preload css/i.test(msg) ||
    /loading chunk [\w-]+ failed/i.test(msg) ||
    /dynamically imported module/i.test(msg)
  )
}

export const reloadForNewChunk = (targetPath?: string): boolean => {
  if (typeof window === 'undefined') return false
  const key = 'otix_chunk_reload_ts'
  const last = sessionStorage.getItem(key)
  const now = Date.now()

  // 3-second debounce to avoid runaway infinite loops while allowing
  // immediate reload on user actions
  if (last && now - parseInt(last, 10) < 3000) {
    return false
  }

  sessionStorage.setItem(key, String(now))

  // If a target path is specified and different from current, navigate directly there
  if (targetPath && window.location.pathname !== targetPath) {
    window.location.href = targetPath
    return true
  }

  // Force cache-busting reload of index.html so the browser downloads
  // the fresh chunk manifest instead of reading stale HTML from disk cache
  const url = new URL(window.location.href)
  url.searchParams.set('otix_reload', String(now))
  window.location.replace(url.toString())
  return true
}

/**
 * Safely prefetch a chunk in route loaders without throwing an unhandled rejection
 * if the chunk has been rotated by a newer deployment.
 */
export const safePrefetchChunk = (importFn: () => Promise<unknown>): void => {
  importFn().catch((err) => {
    if (isChunkLoadError(err)) {
      reloadForNewChunk()
    }
  })
}

/**
 * Safe React.lazy wrapper that automatically intercepts chunk load failures
 * from stale client deployments and triggers a clean reload.
 */
export const safeLazy = <T extends ComponentType<any>>(
  importer: () => Promise<{ default: T } | Record<string, any>>,
  exportName = 'default',
) => {
  return lazy(async () => {
    try {
      const module = await importer()
      const component =
        exportName === 'default'
          ? (module.default || module)
          : module[exportName]
      return { default: component }
    } catch (err) {
      if (isChunkLoadError(err)) {
        reloadForNewChunk()
      }
      throw err
    }
  })
}
