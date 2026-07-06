import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'otix:launcher-settings'

export interface LauncherSettings {
  slideshowWhenInactive: boolean
  backgroundTransitions: boolean
  defaultPage: 'library' | 'slide-picker'
}

const DEFAULTS: LauncherSettings = {
  slideshowWhenInactive: true,
  backgroundTransitions: true,
  defaultPage: 'library',
}

function readSettings(): LauncherSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function useLauncherSettings() {
  const [settings, setSettings] = useState<LauncherSettings>(readSettings)

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSettings(readSettings())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const update = useCallback(<K extends keyof LauncherSettings>(key: K, value: LauncherSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { settings, update }
}
