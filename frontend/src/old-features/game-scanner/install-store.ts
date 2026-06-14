// frontend/src/features/game-scanner/install-store.ts
// Global reactive store for ISO game installation progress.
// Supports multiple concurrent installs keyed by isoPath.
// Survives modal close, page navigation, and component unmounts.
// Persists to localStorage and rehydrates from backend on refresh.

import { useState, useEffect, useCallback } from 'react'
import type { InstallProgress, InstallResult, InstallPhase } from './types'
import type { InstallProgressEvent } from '@/lib/desktop-api'
import { hasDesktopAPI } from './storage'

const LS_KEY = 'otix_game_installs'

// ── Types ──

export interface InstallStoreEntry {
  active: boolean
  isoPath: string
  gameTitle: string | null
  targetDir: string | null
  installId: string | null
  progress: InstallProgress | null
  result: InstallResult | null
  error: string | null
}

type Listener = () => void

// ── Module-level state (persists across component lifecycles) ──

const _installs = new Map<string, InstallStoreEntry>()
const _listeners = new Set<Listener>()
let _ipcUnsub: (() => void) | null = null
const _cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()
let _hydrated = false

function emit(): void {
  _listeners.forEach((l) => l())
}

function getAllInstalls(): InstallStoreEntry[] {
  return Array.from(_installs.values())
}

function persist(): void {
  try {
    const data = JSON.stringify(Array.from(_installs.entries()))
    localStorage.setItem(LS_KEY, data)
  } catch { /* quota exceeded or private browsing */ }
}

function upsertInstall(isoPath: string, partial: Partial<InstallStoreEntry>): void {
  const existing = _installs.get(isoPath) ?? {
    active: false,
    isoPath,
    gameTitle: null,
    targetDir: null,
    installId: null,
    progress: null,
    result: null,
    error: null,
  }
  _installs.set(isoPath, { ...existing, ...partial })
  persist()
  emit()
}

function removeInstall(isoPath: string): void {
  _installs.delete(isoPath)
  const timer = _cleanupTimers.get(isoPath)
  if (timer) { clearTimeout(timer); _cleanupTimers.delete(isoPath) }
  persist()
  emit()
}

// ── IPC listener (dispatches progress to correct install by isoPath) ──

function ensureIpcListening(): void {
  if (_ipcUnsub) return
  if (!hasDesktopAPI()) return
  if (!window.desktopAPI?.onInstallProgress) return
  _ipcUnsub = window.desktopAPI.onInstallProgress((event: InstallProgressEvent) => {
    const path = event.isoPath
    if (!path) return // no routing info — ignore
    const existing = _installs.get(path)
    if (existing) {
      _installs.set(path, {
        ...existing,
        active: true,
        progress: event as InstallProgress,
        installId: event.installId ?? existing.installId,
      })
      persist()
      emit()
    }
  })
}

// ── Hydrate from localStorage + backend on init ──

function hydrateFromStorage(): void {
  if (_hydrated) return
  _hydrated = true
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const entries: [string, InstallStoreEntry][] = JSON.parse(raw)
      for (const [key, entry] of entries) {
        _installs.set(key, entry)
      }
    }
  } catch { /* ignore corrupt data */ }
}

async function syncWithBackend(): Promise<void> {
  if (!hasDesktopAPI()) return
  if (!window.desktopAPI?.getActiveInstalls) return
  try {
    const active: Array<{ installId: string; isoPath: string; targetDir: string; gameTitle: string; startTime: number; phase: string; progress: number; message: string }>
      = await window.desktopAPI.getActiveInstalls()

    const backendIsoPaths = new Set(active.map(i => i.isoPath))

    // Add / update entries the backend knows about
    for (const info of active) {
      _installs.set(info.isoPath, {
        active: true,
        isoPath: info.isoPath,
        gameTitle: info.gameTitle,
        targetDir: info.targetDir,
        installId: info.installId,
        progress: { phase: info.phase as InstallPhase, progress: info.progress, message: info.message },
        result: null,
        error: null,
      })
    }

    // Remove stale active entries the backend no longer tracks
    // (install finished, was canceled, or Electron restarted and the process died)
    for (const [isoPath, entry] of _installs) {
      if (entry.active && !backendIsoPaths.has(isoPath)) {
        _installs.delete(isoPath)
      }
    }

    persist()
    emit()
  } catch { /* ignore */ }
}

// Init — runs once at module load
hydrateFromStorage()
// Defer backend sync so components get instant localStorage render first
if (typeof window !== 'undefined') {
  setTimeout(() => { syncWithBackend().catch(() => {}) }, 0)
}

// ── Public API ──

export function subscribeInstall(listener: Listener): () => void {
  _listeners.add(listener)
  return () => { _listeners.delete(listener) }
}

export function getInstallState(): InstallStoreEntry[] {
  return getAllInstalls()
}

/** Call before api.installGame() to create a store entry. */
export function startInstall(
  isoPath: string,
  gameTitle: string,
  targetDir: string,
): void {
  ensureIpcListening()
  const oldTimer = _cleanupTimers.get(isoPath)
  if (oldTimer) { clearTimeout(oldTimer); _cleanupTimers.delete(isoPath) }
  upsertInstall(isoPath, {
    active: true,
    gameTitle,
    targetDir,
    installId: null,
    progress: null,
    result: null,
    error: null,
  })
}

/** Call when api.installGame() resolves. */
export function completeInstall(isoPath: string, result: InstallResult): void {
  const entry = _installs.get(isoPath)
  if (!entry) return
  const finalProgress: InstallProgress | null =
    result.success
      ? { phase: 'done', progress: 100, message: 'Installation complete' }
      : entry.progress ?? { phase: 'error', progress: 0, message: result.error ?? 'Installation failed' }
  _installs.set(isoPath, {
    ...entry,
    active: false,
    progress: entry.progress ?? finalProgress,
    result,
    error: result.success ? null : (result.error ?? 'Installation failed'),
  })
  persist()
  emit()
  scheduleCleanup(isoPath)
}

/** Call when api.installGame() throws. */
export function failInstall(isoPath: string, error: string): void {
  const entry = _installs.get(isoPath) ?? {
    active: false, isoPath, gameTitle: null, targetDir: null,
    installId: null, progress: null, result: null, error: null,
  }
  _installs.set(isoPath, {
    ...entry,
    active: false,
    progress: entry.progress ?? { phase: 'error', progress: 0, message: error },
    error,
  })
  persist()
  emit()
  scheduleCleanup(isoPath)
}

function scheduleCleanup(isoPath: string): void {
  const existing = _cleanupTimers.get(isoPath)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => { removeInstall(isoPath) }, 120_000)
  _cleanupTimers.set(isoPath, timer)
}

/** Remove a completed/errored entry. */
export function dismissInstall(isoPath: string): void {
  removeInstall(isoPath)
}

/** Cancel a specific install by isoPath. */
export function cancelInstallByIsoPath(isoPath: string): void {
  const entry = _installs.get(isoPath)
  if (!entry) return
  try {
    if (window.desktopAPI?.cancelInstall) window.desktopAPI.cancelInstall(isoPath)
  } catch {}
  removeInstall(isoPath)
}

/** Clear all state. */
export function resetAllInstalls(): void {
  for (const timer of _cleanupTimers.values()) clearTimeout(timer)
  _cleanupTimers.clear()
  _ipcUnsub?.()
  _ipcUnsub = null
  _installs.clear()
  try { localStorage.removeItem(LS_KEY) } catch {}
  emit()
}

// ── React hook ──

export function useInstallProgress(): {
  installs: InstallStoreEntry[]
  activeInstalls: InstallStoreEntry[]
  startInstall: (isoPath: string, gameTitle: string, targetDir: string) => void
  completeInstall: (isoPath: string, result: InstallResult) => void
  failInstall: (isoPath: string, error: string) => void
  dismissInstall: (isoPath: string) => void
  cancelInstall: (isoPath: string) => void
} {
  const [, setTick] = useState(0)

  useEffect(() => {
    return subscribeInstall(() => { setTick((t) => t + 1) })
  }, [])

  const allInstalls = getAllInstalls()
  const active = allInstalls.filter((i) => i.active)

  return {
    installs: allInstalls,
    activeInstalls: active,
    startInstall: useCallback(startInstall, []),
    completeInstall: useCallback(completeInstall, []),
    failInstall: useCallback(failInstall, []),
    dismissInstall: useCallback(dismissInstall, []),
    cancelInstall: useCallback(cancelInstallByIsoPath, []),
  }
}
