import { useState, useCallback, useEffect } from 'react'
import { useAuth } from '@/features/auth/hooks/use-auth'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import { apiClient } from '@/lib/api/client'
import {
  checkLocalNode,
  claimNodeWithPin,
  selectLocalGameDirectory,
  saveLibraryScanDirectory,
  markOnboardingFinished,
  getDefaultPrimaryGamePath,
  getInitialGamePath,
  unclaimNode,
  isNodeOrphaned,
} from '../utils/setup-wizard-utils'

export type SetupWizardStep = 1 | 2 | 3 | 4 | 5

export interface UseSetupWizardReturn {
  step: SetupWizardStep
  totalSteps: number
  mode: 'desktop' | 'node' | 'cloud'
  setMode: (mode: 'desktop' | 'node' | 'cloud') => void
  node: PendingNode | null
  isProbingNode: boolean
  probeNode: () => Promise<void>
  isOrphaned: boolean
  isUnclaiming: boolean
  handleUnclaimNode: () => Promise<boolean>
  claimPin: string
  setClaimPin: (pin: string) => void
  claimStatus: 'idle' | 'claiming' | 'success' | 'error'
  claimError: string | null
  handleClaimNode: () => Promise<boolean>
  gamePath: string | null
  setGamePath: (path: string | null) => void
  isSelectingPath: boolean
  handleSelectGamePath: () => Promise<void>
  telemetryEnabled: boolean
  setTelemetryEnabled: (enabled: boolean) => void
  freeGamesAlerts: boolean
  setFreeGamesAlerts: (enabled: boolean) => void
  isFinishing: boolean
  nextStep: () => void
  prevStep: () => void
  goToStep: (step: SetupWizardStep) => void
  finishSetup: (onDone?: () => void) => Promise<void>
}

export const useSetupWizard = (initialStep: SetupWizardStep = 1): UseSetupWizardReturn => {
  const { isAuthenticated, refreshUser } = useAuth()
  const [step, setStep] = useState<SetupWizardStep>(initialStep)
  const [mode, setMode] = useState<'desktop' | 'node' | 'cloud'>('desktop')

  // Node detection & claim state
  const [node, setNode] = useState<PendingNode | null>(null)
  const [isProbingNode, setIsProbingNode] = useState(false)
  const [isOrphaned, setIsOrphaned] = useState(false)
  const [isUnclaiming, setIsUnclaiming] = useState(false)
  const [claimPin, setClaimPin] = useState('')
  const [claimStatus, setClaimStatus] = useState<'idle' | 'claiming' | 'success' | 'error'>('idle')
  const [claimError, setClaimError] = useState<string | null>(null)

  // Library & settings state (defaults to primary drive Otix folder)
  const [gamePath, setGamePath] = useState<string | null>(() => getDefaultPrimaryGamePath())
  const [isSelectingPath, setIsSelectingPath] = useState(false)
  const [telemetryEnabled, setTelemetryEnabled] = useState(true)
  const [freeGamesAlerts, setFreeGamesAlerts] = useState(true)
  const [isFinishing, setIsFinishing] = useState(false)

  // Check if existing desktop settings already define a games install path
  useEffect(() => {
    let active = true
    void getInitialGamePath().then((path) => {
      if (active && path) {
        setGamePath(path)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const probeNode = useCallback(async () => {
    setIsProbingNode(true)
    try {
      const found = await checkLocalNode()
      setNode(found)
      if (found?.claimed) {
        let orphaned = true
        if (isAuthenticated) {
          try {
            const { data } = await apiClient.get<Array<{ primaryUrl?: string; localUrl?: string | null; authToken?: string | null }>>('/library/servers')
            const list = Array.isArray(data) ? data : []
            orphaned = isNodeOrphaned(found, list)
          } catch {
            orphaned = true
          }
        }
        setIsOrphaned(orphaned)
        if (orphaned) {
          setClaimStatus('idle')
        } else {
          setClaimStatus('success')
        }
      } else {
        setIsOrphaned(false)
        if (found?.claimCode) {
          setClaimPin(found.claimCode)
        }
      }
    } catch {
      setNode(null)
      setIsOrphaned(false)
    } finally {
      setIsProbingNode(false)
    }
  }, [isAuthenticated])

  const handleUnclaimNode = useCallback(async (): Promise<boolean> => {
    setIsUnclaiming(true)
    try {
      const ok = await unclaimNode(node?.authToken)
      if (ok) {
        await probeNode()
        return true
      }
      return false
    } finally {
      setIsUnclaiming(false)
    }
  }, [node, probeNode])

  // Auto-probe when entering node step
  useEffect(() => {
    if (step === 2) {
      void probeNode()
    }
  }, [step, probeNode])

  const handleClaimNode = useCallback(async (): Promise<boolean> => {
    if (!claimPin.trim()) return false
    setClaimStatus('claiming')
    setClaimError(null)

    const targetUrl = node?.localUrl || 'http://127.0.0.1:8090'
    const res = await claimNodeWithPin(targetUrl, claimPin.trim(), node?.serverName)
    if (res.success) {
      setClaimStatus('success')
      return true
    } else {
      setClaimStatus('error')
      setClaimError(res.message || 'Failed to claim node')
      return false
    }
  }, [claimPin, node])

  const handleSelectGamePath = useCallback(async () => {
    setIsSelectingPath(true)
    try {
      const selected = await selectLocalGameDirectory()
      if (selected) {
        setGamePath(selected)
        void saveLibraryScanDirectory(selected)
      }
    } finally {
      setIsSelectingPath(false)
    }
  }, [])

  const nextStep = useCallback(() => {
    if (step === 3 && gamePath) {
      void saveLibraryScanDirectory(gamePath)
    }
    setStep((prev) => (Math.min(prev + 1, 5) as SetupWizardStep))
  }, [step, gamePath])

  const prevStep = useCallback(() => {
    setStep((prev) => (Math.max(prev - 1, 1) as SetupWizardStep))
  }, [])

  const goToStep = useCallback((target: SetupWizardStep) => {
    setStep(target)
  }, [])

  const finishSetup = useCallback(
    async (onDone?: () => void) => {
      setIsFinishing(true)
      try {
        if (gamePath) {
          await saveLibraryScanDirectory(gamePath)
        }
        await markOnboardingFinished(isAuthenticated)
        if (isAuthenticated) {
          void refreshUser()
        }
        onDone?.()
      } finally {
        setIsFinishing(false)
      }
    },
    [isAuthenticated, refreshUser, gamePath],
  )

  return {
    step,
    totalSteps: 5,
    mode,
    setMode,
    node,
    isProbingNode,
    probeNode,
    isOrphaned,
    isUnclaiming,
    handleUnclaimNode,
    claimPin,
    setClaimPin,
    claimStatus,
    claimError,
    handleClaimNode,
    gamePath,
    setGamePath,
    isSelectingPath,
    handleSelectGamePath,
    telemetryEnabled,
    setTelemetryEnabled,
    freeGamesAlerts,
    setFreeGamesAlerts,
    isFinishing,
    nextStep,
    prevStep,
    goToStep,
    finishSetup,
  }
}
