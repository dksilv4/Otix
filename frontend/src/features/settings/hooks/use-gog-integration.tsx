import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { openBoundModal } from '../utils/integrations'
import { extractIntegrationMessage } from '../utils/integrations'
import { GOGCodeModal } from '../components/organisms/gog-code-modal'
import type { SettingsUser } from '../types'

export const useGogIntegration = (user: SettingsUser | null | undefined, openModal: any) => {
  const [gogConnected, setGOGConnected] = useState(Boolean(user?.gogAccountId))
  const [gogDisplayName, setGOGDisplayName] = useState<string | null>(user?.gogDisplayName ?? null)
  const [gogAccountId, setGOGAccountId] = useState<string | null>(user?.gogAccountId ?? null)
  const [gogConnecting, setGOGConnecting] = useState(false)
  const [gogDisconnecting, setGOGDisconnecting] = useState(false)
  const [gogScanning, setGOGScanning] = useState(false)
  const [gogScanResult, setGOGScanResult] = useState<{
    totalInGOG: number
    matchedInOtix: number
    failed: number
    source?: string
  } | null>(null)
  const [gogResolvingSteamGrid, setGOGResolvingSteamGrid] = useState(false)
  const [gogSteamGridResult, setGOGSteamGridResult] = useState<{
    total: number
    matched: number
    failed: number
  } | null>(null)
  const [gogMessage, setGOGMessage] = useState('')
  const [gogError, setGOGError] = useState('')

  useEffect(() => {
    if (user?.gogAccountId !== undefined) {
      setGOGConnected(Boolean(user.gogAccountId))
      setGOGAccountId(user.gogAccountId ?? null)
    }
    if (user?.gogDisplayName !== undefined) {
      setGOGDisplayName(user.gogDisplayName ?? null)
    }
  }, [user?.gogAccountId, user?.gogDisplayName])

  const fetchGOGStatus = async () => {
    try {
      const { data } = await apiClient.get<{
        connected?: boolean
        displayName?: string
        accountId?: string
      }>('/integrations/gog/status')
      setGOGConnected(Boolean(data.connected))
      setGOGDisplayName(data.displayName ?? null)
      setGOGAccountId(data.accountId ?? null)
    } catch {
      // ignore
    }
  }

  const handleGOGConnect = async () => {
    setGOGConnecting(true)
    setGOGError('')
    try {
      const { data } = await apiClient.get<{ authUrl: string; state: string }>('/integrations/gog/auth-url')
      const authUrl = data?.authUrl
      const state = data?.state
      if (!authUrl || !state) {
        setGOGError('Invalid authentication URL received.')
        return
      }
      openBoundModal(openModal, (onClose) => (
        <GOGCodeModal
          authUrl={authUrl}
          state={state}
          onClose={onClose}
          onLinked={() => { void fetchGOGStatus() }}
        />
      ))
    } catch (err) {
      setGOGError(extractIntegrationMessage(err))
    } finally {
      setGOGConnecting(false)
    }
  }

  const handleGOGDisconnect = async () => {
    setGOGDisconnecting(true)
    setGOGError('')
    try {
      await apiClient.delete('/integrations/gog/disconnect')
      setGOGConnected(false)
      setGOGDisplayName(null)
      setGOGAccountId(null)
      setGOGMessage('GOG account disconnected.')
    } catch (err) {
      setGOGError(extractIntegrationMessage(err))
    } finally {
      setGOGDisconnecting(false)
    }
  }

  const handleGOGScan = async () => {
    setGOGScanning(true)
    setGOGError('')
    setGOGMessage('')
    try {
      const { data } = await apiClient.post<{
        totalInGOG: number
        matchedInOtix: number
        failed: number
        source?: string
      }>('/integrations/gog/scan')
      setGOGScanResult(data)
      setGOGMessage(
        `Scanned ${data.totalInGOG} games from GOG (${data.matchedInOtix} matched).`,
      )
    } catch (err) {
      setGOGError(extractIntegrationMessage(err))
    } finally {
      setGOGScanning(false)
    }
  }

  const handleGOGResolveSteamGrid = async () => {
    setGOGResolvingSteamGrid(true)
    setGOGError('')
    setGOGMessage('')
    try {
      const { data } = await apiClient.post<{
        total: number
        matched: number
        failed: number
      }>('/integrations/gog/steamgrid-resolve')
      setGOGSteamGridResult(data)
      setGOGMessage(
        `Updated artwork for ${data.matched} of ${data.total} GOG games from SteamGridDB.`,
      )
    } catch (err) {
      setGOGError(extractIntegrationMessage(err))
    } finally {
      setGOGResolvingSteamGrid(false)
    }
  }

  return {
    gogConnected,
    isGOGConnected: gogConnected,
    setGOGConnected,
    gogDisplayName,
    setGOGDisplayName,
    gogAccountId,
    setGOGAccountId,
    gogConnecting,
    setGOGConnecting,
    gogDisconnecting,
    setGOGDisconnecting,
    gogScanning,
    setGOGScanning,
    gogScanResult,
    setGOGScanResult,
    gogResolvingSteamGrid,
    setGOGResolvingSteamGrid,
    gogSteamGridResult,
    setGOGSteamGridResult,
    gogMessage,
    setGOGMessage,
    gogError,
    setGOGError,
    fetchGOGStatus,
    handleGOGConnect,
    handleGOGDisconnect,
    handleGOGScan,
    handleGOGResolveSteamGrid,
  }
}
