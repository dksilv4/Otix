import type { ErrorComponentProps } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { isChunkLoadError, reloadForNewChunk } from '@/lib/utils/chunk-reload'

export const RouteError = ({ error, reset }: ErrorComponentProps) => {
  const isChunk = isChunkLoadError(error)

  useEffect(() => {
    if (isChunk) {
      reloadForNewChunk()
    }
  }, [isChunk])

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'An unexpected error occurred while loading this page.'

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
      <div className="rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl p-8 max-w-md shadow-2xl flex flex-col items-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground/60 mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">
          {isChunk ? 'New Version Available' : 'Something went wrong'}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {isChunk
            ? 'A new version of Otix was deployed. Reloading to get the latest updates...'
            : errorMessage}
        </p>
        <button
          type="button"
          onClick={() => {
            if (isChunk) {
              window.location.reload()
            } else {
              reset()
            }
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <RefreshCw className="h-4 w-4" />
          {isChunk ? 'Refresh now' : 'Try again'}
        </button>
      </div>
    </div>
  )
};
