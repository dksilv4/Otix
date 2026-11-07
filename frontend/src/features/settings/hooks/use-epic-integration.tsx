import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { openBoundModal } from '../utils/integrations'
import { extractIntegrationMessage } from '../utils/integrations'
import { EpicCodeModal } from '../components/organisms/epic-code-modal'
import type { SettingsUser } from '../types'

export const useEpicIntegration = (user: SettingsUser | null | undefined, openModal: any) => {
  const [epicConnected, setEpicConnected] = useState(Boolean(user?.epicAccountId))
  const [epicDisplayName, setEpicDisplayName] = useState<string | null>(user?.epicDisplayName ?? null)
  const [epicAccountId, setEpicAccountId] = useState<string | null>(user?.epicAccountId ?? null)
  const [epicConnecting, setEpicConnecting] = useState(false)
  const [epicDisconnecting, setEpicDisconnecting] = useState(false)
  const [epicScanning, setEpicScanning] = useState(false)
  const [epicScanResult, setEpicScanResult] = useState<{
    totalInEpic: number
    matchedInOtix: number
    failed: number
    source?: string
  } | null>(null)
  const [epicResolvingSteamGrid, setEpicResolvingSteamGrid] = useState(false)
  const [epicSteamGridResult, setEpicSteamGridResult] = useState<{
    total: number
    matched: number
    failed: number
  } | null>(null)
  const [epicMessage, setEpicMessage] = useState('')
  const [epicError, setEpicError] = useState('')

  useEffect(() => {
    if (user?.epicAccountId !== undefined) {
      setEpicConnected(Boolean(user.epicAccountId))
      setEpicAccountId(user.epicAccountId ?? null)
    }
    if (user?.epicDisplayName !== undefined) {
      setEpicDisplayName(user.epicDisplayName ?? null)
    }
  }, [user?.epicAccountId, user?.epicDisplayName])

  const fetchEpicStatus = async () => {
    try {
      const { data } = await apiClient.get<{
        connected?: boolean
        displayName?: string
        accountId?: string
      }>('/integrations/epic/status')
      setEpicConnected(Boolean(data.connected))
      setEpicDisplayName(data.displayName ?? null)
      setEpicAccountId(data.accountId ?? null)
    } catch {
      // ignore
    }
  }

  const handleEpicConnect = async () => {
    setEpicConnecting(true)
    setEpicError('')
    try {
      const { data } = await apiClient.get<{ authUrl: string; state: string; fallbackToManual?: boolean }>(
        '/integrations/epic/auth-url',
      )
      const authUrl = data?.authUrl
      const state = data?.state
      if (!authUrl || !state) {
        setEpicError('Invalid authentication URL received.')
        return
      }
      openBoundModal(openModal, (onClose) => (
        <EpicCodeModal
          authUrl={authUrl}
          state={state}
          onClose={onClose}
          onLinked={() => { void fetchEpicStatus() }}
        />
      ))
    } catch (err) {
      setEpicError(extractIntegrationMessage(err))
    } finally {
      setEpicConnecting(false)
    }
  }

  const handleEpicDisconnect = async () => {
    setEpicDisconnecting(true)
    setEpicError('')
    try {
      await apiClient.delete('/integrations/epic/disconnect')
      setEpicConnected(false)
      setEpicDisplayName(null)
      setEpicAccountId(null)
      setEpicMessage('Epic Games account disconnected.')
    } catch (err) {
      setEpicError(extractIntegrationMessage(err))
    } finally {
      setEpicDisconnecting(false)
    }
  }

  const handleEpicScan = async () => {
    setEpicScanning(true)
    setEpicError('')
    setEpicMessage('')
    try {
      const { data } = await apiClient.post<{
        totalInEpic: number
        matchedInOtix: number
        failed: number
        source?: string
      }>('/integrations/epic/scan')
      setEpicScanResult(data)
      setEpicMessage(
        `Scanned ${data.totalInEpic} games from Epic (${data.matchedInOtix} matched).`,
      )
    } catch (err) {
      setEpicError(extractIntegrationMessage(err))
    } finally {
      setEpicScanning(false)
    }
  }

  const handleEpicResolveSteamGrid = async () => {
    setEpicResolvingSteamGrid(true)
    setEpicError('')
    setEpicMessage('')
    try {
      const { data } = await apiClient.post<{
        total: number
        matched: number
        failed: number
      }>('/integrations/epic/steamgrid-resolve')
      setEpicSteamGridResult(data)
      setEpicMessage(
        `Updated artwork for ${data.matched} of ${data.total} Epic games from SteamGridDB.`,
      )
    } catch (err) {
      setEpicError(extractIntegrationMessage(err))
    } finally {
      setEpicResolvingSteamGrid(false)
    }
  }

  return {
    epicConnected,
    isEpicConnected: epicConnected,
    setEpicConnected,
    epicDisplayName,
    setEpicDisplayName,
    epicAccountId,
    setEpicAccountId,
    epicConnecting,
    setEpicConnecting,
    epicDisconnecting,
    setEpicDisconnecting,
    epicScanning,
    setEpicScanning,
    epicScanResult,
    setEpicScanResult,
    epicResolvingSteamGrid,
    setEpicResolvingSteamGrid,
    epicSteamGridResult,
    setEpicSteamGridResult,
    epicMessage,
    setEpicMessage,
    epicError,
    setEpicError,
    fetchEpicStatus,
    handleEpicConnect,
    handleEpicDisconnect,
    handleEpicScan,
    handleEpicResolveSteamGrid,
  }
}
