import { useSyncExternalStore } from 'react'
import { getDesktopAPI } from '@/lib/desktop/api'

export interface ScanProgressState {
  isScanning: boolean
  progress: number
  currentDir: string
  phase: 'idle' | 'scanning' | 'matching' | 'complete' | 'error'
}

export const SCAN_PROGRESS_EVENT = 'otix:scan-progress'

const initialState: ScanProgressState = {
  isScanning: false,
  progress: 0,
  currentDir: '',
  phase: 'idle',
}

let currentState: ScanProgressState = { ...initialState }
const listeners = new Set<() => void>()
let resetTimer: ReturnType<typeof setTimeout> | null = null

const clearResetTimer = () => {
  if (resetTimer) {
    clearTimeout(resetTimer)
    resetTimer = null
  }
}

const emitChange = () => {
  for (const listener of listeners) {
    listener()
  }
}

const updateState = (updater: (prev: ScanProgressState) => ScanProgressState) => {
  currentState = updater(currentState)
  emitChange()
}

export const startScan = (initialLabel?: string) => {
  clearResetTimer()
  updateState(() => ({
    isScanning: true,
    progress: 5,
    currentDir: initialLabel || 'Preparing library scan...',
    phase: 'scanning',
  }))
}

export const reportProgress = (
  progress: number,
  dirOrMessage?: string,
  phase?: ScanProgressState['phase'],
) => {
  clearResetTimer()
  const clamped = Math.min(100, Math.max(0, progress))
  const isDone = clamped >= 100

  updateState((prev) => {
    const nextPhase: ScanProgressState['phase'] = isDone
      ? 'complete'
      : (phase ?? (prev.phase === 'idle' ? 'scanning' : prev.phase))

    return {
      isScanning: !isDone,
      progress: clamped,
      currentDir: dirOrMessage ?? prev.currentDir,
      phase: nextPhase,
    }
  })

  if (isDone) {
    resetTimer = setTimeout(() => {
      currentState = { ...initialState }
      emitChange()
    }, 3500)
  }
}

export const finishScan = (summaryMessage?: string) => {
  reportProgress(100, summaryMessage || 'Scan complete', 'complete')
}

export const errorScan = (errorMessage?: string) => {
  clearResetTimer()
  updateState(() => ({
    isScanning: false,
    progress: 100,
    currentDir: errorMessage || 'Scan failed',
    phase: 'error',
  }))

  resetTimer = setTimeout(() => {
    currentState = { ...initialState }
    emitChange()
  }, 4000)
}

// Global setup for desktop IPC & window events (runs once on client)
let isInitialized = false
const initializeScannerBridge = () => {
  if (isInitialized || typeof window === 'undefined') return
  isInitialized = true

  const api = getDesktopAPI() ?? (window as any).desktopAPI
  if (api?.onScannerProgress) {
    api.onScannerProgress((data: { currentDir?: string; progress?: number }) => {
      if (typeof data?.progress === 'number') {
        reportProgress(data.progress, data.currentDir)
      }
    })
  }

  window.addEventListener(SCAN_PROGRESS_EVENT, ((e: CustomEvent<{
    progress: number
    currentDir?: string
    phase?: ScanProgressState['phase']
  }>) => {
    if (e.detail && typeof e.detail.progress === 'number') {
      reportProgress(e.detail.progress, e.detail.currentDir, e.detail.phase)
    }
  }) as EventListener)
}

const subscribe = (listener: () => void) => {
  initializeScannerBridge()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => currentState

export const useScanProgress = () => {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => initialState)

  return {
    isScanning: state.isScanning,
    progress: state.progress,
    currentDir: state.currentDir,
    phase: state.phase,
    startScan,
    reportProgress,
    finishScan,
    errorScan,
  }
}
