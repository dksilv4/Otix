import { useState } from 'react'
import { apiClient } from '@/lib/api/client'
import { extractIntegrationMessage, type YouTubeProgressState } from '../utils/integrations'
import type { SettingsUser } from '../types'

export const useGoogleIntegration = (user: SettingsUser | null | undefined, handleConnect: (provider: string) => void) => {
  const [googleConnected, setGoogleConnected] = useState(Boolean(user?.googleId))
  const [googleName, setGoogleName] = useState<string | null>(user?.googleName ?? null)
  const [googleEmail, setGoogleEmail] = useState<string | null>(user?.googleEmail ?? null)
  const [googleAvatarUrl, setGoogleAvatarUrl] = useState<string | null>(user?.googleAvatarUrl ?? null)
  const [googleConnecting, setGoogleConnecting] = useState(false)
  const [googleDisconnecting, setGoogleDisconnecting] = useState(false)
  const [googleMessage, setGoogleMessage] = useState('')
  const [googleError, setGoogleError] = useState('')

  const [driveConnected, setDriveConnected] = useState(Boolean(user?.driveConnected))
  const [driveConnecting, setDriveConnecting] = useState(false)
  const [driveDisconnecting, setDriveDisconnecting] = useState(false)
  const [driveMessage, setDriveMessage] = useState('')
  const [driveError, setDriveError] = useState('')

  const [youtubeSyncing, setYoutubeSyncing] = useState(false)
  const [youtubeSyncResult, setYoutubeSyncResult] = useState<{
    channels: number
    playlists: number
    subscriptions: number
    videos: number
  } | null>(null)
  const [youtubeProgress, setYoutubeProgress] = useState<YouTubeProgressState | null>(null)
  const [youtubeError, setYoutubeError] = useState('')
  const [youtubeMessage, setYoutubeMessage] = useState('')

  const handleGoogleConnect = async () => {
    setGoogleConnecting(true)
    setGoogleError('')
    try {
      handleConnect('google')
    } catch (err) {
      setGoogleError(extractIntegrationMessage(err))
    } finally {
      setGoogleConnecting(false)
    }
  }

  const handleGoogleDisconnect = async () => {
    setGoogleDisconnecting(true)
    setGoogleError('')
    try {
      await apiClient.delete('/integrations/google/disconnect')
      setGoogleConnected(false)
      setGoogleName(null)
      setGoogleEmail(null)
      setGoogleAvatarUrl(null)
      setDriveConnected(false)
      setGoogleMessage('Google account disconnected.')
    } catch (err) {
      setGoogleError(extractIntegrationMessage(err))
    } finally {
      setGoogleDisconnecting(false)
    }
  }

  const handleDriveConnect = async () => {
    setDriveConnecting(true)
    setDriveError('')
    try {
      handleConnect('google_drive')
    } catch (err) {
      setDriveError(extractIntegrationMessage(err))
    } finally {
      setDriveConnecting(false)
    }
  }

  const handleDriveDisconnect = async () => {
    setDriveDisconnecting(true)
    setDriveError('')
    try {
      await apiClient.delete('/integrations/drive/disconnect')
      setDriveConnected(false)
      setDriveMessage('Google Drive disconnected.')
    } catch (err) {
      setDriveError(extractIntegrationMessage(err))
    } finally {
      setDriveDisconnecting(false)
    }
  }

  const handleYouTubeSync = async () => {
    setYoutubeSyncing(true)
    setYoutubeError('')
    setYoutubeMessage('')
    try {
      const { data } = await apiClient.post('/integrations/youtube/sync')
      setYoutubeSyncResult(data)
      setYoutubeMessage('YouTube library synced successfully.')
    } catch (err) {
      setYoutubeError(extractIntegrationMessage(err))
    } finally {
      setYoutubeSyncing(false)
    }
  }

  return {
    googleConnected,
    isGoogleConnected: googleConnected,
    googleName,
    googleEmail,
    googleAvatarUrl,
    googleConnecting,
    googleDisconnecting,
    googleMessage,
    googleError,
    driveConnected,
    driveConnecting,
    driveDisconnecting,
    driveMessage,
    driveError,
    youtubeSyncing,
    youtubeSyncResult,
    youtubeProgress,
    youtubeError,
    youtubeMessage,
    setYoutubeError,
    setYoutubeMessage,
    handleGoogleConnect,
    handleGoogleDisconnect,
    handleDriveConnect,
    handleDriveDisconnect,
    handleYouTubeSync,
  }
}
