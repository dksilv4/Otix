import { useState } from 'react'
import { apiClient } from '@/lib/api/client'
import { extractIntegrationMessage } from '../utils/integrations'
import type { SettingsUser } from '../types'

export const tmdbSyncDirections = [
  { value: 'disabled', label: 'Disabled' },
  { value: 'two_way', label: 'Two-way sync' },
  { value: 'import_only', label: 'Import from TMDb only' },
  { value: 'export_only', label: 'Export to TMDb only' },
]

export const useTmdbIntegration = (user: SettingsUser | null | undefined, handleConnect: (provider: string) => void) => {
  const [tmdbConnected, setTmdbConnected] = useState(Boolean(user?.tmdbUsername))
  const [tmdbUsername, setTmdbUsername] = useState<string | null>(user?.tmdbUsername ?? null)
  const [tmdbAvatarUrl, setTmdbAvatarUrl] = useState<string | null>(user?.tmdbAvatarUrl ?? null)
  const [tmdbStats, setTmdbStats] = useState<Record<string, number> | null>(null)
  const [tmdbSyncDirection, setTmdbSyncDirection] = useState(user?.tmdbRatingSyncDirection ?? 'disabled')
  const [tmdbSyncing, setTmdbSyncing] = useState(false)
  const [tmdbWatchlistImporting, setTmdbWatchlistImporting] = useState(false)
  const [tmdbSyncResult, setTmdbSyncResult] = useState<{
    imported: number
    exported: number
    skipped: number
  } | null>(null)
  const [tmdbWatchlistResult, setTmdbWatchlistResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [tmdbConnecting, setTmdbConnecting] = useState(false)
  const [tmdbDisconnecting, setTmdbDisconnecting] = useState(false)
  const [tmdbMessage, setTmdbMessage] = useState('')
  const [tmdbError, setTmdbError] = useState('')

  const handleTmdbConnect = async () => {
    setTmdbConnecting(true)
    setTmdbError('')
    try {
      handleConnect('tmdb')
    } catch (err) {
      setTmdbError(extractIntegrationMessage(err))
    } finally {
      setTmdbConnecting(false)
    }
  }

  const handleTmdbDisconnect = async () => {
    setTmdbDisconnecting(true)
    setTmdbError('')
    try {
      await apiClient.delete('/integrations/tmdb/disconnect')
      setTmdbConnected(false)
      setTmdbUsername(null)
      setTmdbAvatarUrl(null)
      setTmdbStats(null)
      setTmdbMessage('TMDb account disconnected.')
    } catch (err) {
      setTmdbError(extractIntegrationMessage(err))
    } finally {
      setTmdbDisconnecting(false)
    }
  }

  const handleTmdbRatingSync = async () => {
    setTmdbSyncing(true)
    setTmdbError('')
    setTmdbMessage('')
    try {
      const { data } = await apiClient.post('/integrations/tmdb/rating-sync', { direction: tmdbSyncDirection })
      setTmdbSyncResult(data)
      setTmdbMessage('Ratings synced successfully.')
    } catch (err) {
      setTmdbError(extractIntegrationMessage(err))
    } finally {
      setTmdbSyncing(false)
    }
  }

  const handleTmdbWatchlistImport = async () => {
    setTmdbWatchlistImporting(true)
    setTmdbError('')
    setTmdbMessage('')
    try {
      const { data } = await apiClient.post('/integrations/tmdb/watchlist-import')
      setTmdbWatchlistResult(data)
      setTmdbMessage(`Imported ${data.imported} items from TMDb watchlist.`)
    } catch (err) {
      setTmdbError(extractIntegrationMessage(err))
    } finally {
      setTmdbWatchlistImporting(false)
    }
  }

  return {
    tmdbConnected,
    isTmdbConnected: tmdbConnected,
    tmdbUsername,
    setTmdbUsername,
    tmdbAvatarUrl,
    setTmdbAvatarUrl,
    tmdbStats,
    setTmdbStats,
    tmdbSyncDirection,
    setTmdbSyncDirection,
    tmdbSyncing,
    tmdbWatchlistImporting,
    tmdbSyncResult,
    tmdbWatchlistResult,
    tmdbConnecting,
    tmdbDisconnecting,
    tmdbMessage,
    tmdbError,
    tmdbSyncDirections,
    handleTmdbConnect,
    handleTmdbDisconnect,
    handleTmdbRatingSync,
    handleTmdbWatchlistImport,
  }
}
