import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@auth/hooks/use-auth'
import { libraryKeys } from '@library/library-keys'
import { showToast } from '@ui/molecules/toast'
import {
  consumePendingPlexSyncPrompt,
  executePlexSync,
  notifyPlexSyncResult,
  PLEX_PROMPT_EVENT,
  type PlexSyncOptions,
  type PlexSyncPromptMode,
} from '../utils/plex-sync'

export const usePlexSyncPrompt = () => {
  const { isAuthenticated } = useAuth()
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<PlexSyncPromptMode>('link')
  const [syncing, setSyncing] = useState(false)
  const [options, setOptions] = useState<PlexSyncOptions>({
    syncWatchlist: true,
    syncWatched: true,
  })

  const promptedRef = useRef(false)

  const openPrompt = useCallback((promptMode: PlexSyncPromptMode) => {
    setMode(promptMode)
    setOptions({ syncWatchlist: true, syncWatched: true })
    setOpen(true)
  }, [])

  // Listen for explicit trigger events
  useEffect(() => {
    const handleEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ mode?: PlexSyncPromptMode }>
      const promptMode = customEvent.detail?.mode || 'link'
      openPrompt(promptMode)
    }

    window.addEventListener(PLEX_PROMPT_EVENT, handleEvent)
    return () => {
      window.removeEventListener(PLEX_PROMPT_EVENT, handleEvent)
    }
  }, [openPrompt])

  // Check pending prompt in storage on mount or auth resolution
  useEffect(() => {
    if (!isAuthenticated) return
    if (promptedRef.current) return

    const pendingMode = consumePendingPlexSyncPrompt()
    if (pendingMode) {
      promptedRef.current = true
      openPrompt(pendingMode)
    }
  }, [isAuthenticated, openPrompt])

  const toggleOption = useCallback((key: keyof PlexSyncOptions, val?: boolean) => {
    setOptions((prev) => ({
      ...prev,
      [key]: val !== undefined ? val : !prev[key],
    }))
  }, [])

  const handleSkip = useCallback(() => {
    setOpen(false)
  }, [])

  const handleSync = useCallback(async () => {
    if (!options.syncWatchlist && !options.syncWatched) {
      setOpen(false)
      return
    }

    setSyncing(true)
    try {
      const result = await executePlexSync(options)
      notifyPlexSyncResult(result)
      queryClient.invalidateQueries({ queryKey: libraryKeys.all() })
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
      queryClient.invalidateQueries({ queryKey: ['discover'] })
      setOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not complete Plex sync.'
      showToast({
        title: 'Plex sync failed',
        description: msg,
        variant: 'error',
      })
    } finally {
      setSyncing(false)
    }
  }, [options, queryClient])

  return {
    open,
    setOpen,
    mode,
    options,
    toggleOption,
    syncing,
    handleSync,
    handleSkip,
  }
}
