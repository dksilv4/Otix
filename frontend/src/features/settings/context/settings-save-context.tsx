import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export interface SettingsSaveConfig {
  hasChanges: boolean
  onSave?: () => void | Promise<void>
  onDiscard?: () => void
  saving?: boolean
  saved?: boolean
  label?: string
}

interface SettingsSaveContextType {
  config: SettingsSaveConfig | null
  setConfig: (config: SettingsSaveConfig | null) => void
  clearConfig: () => void
}

const SettingsSaveContext = createContext<SettingsSaveContextType | undefined>(undefined)

export function SettingsSaveProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<SettingsSaveConfig | null>(null)

  const setConfig = useCallback((newConfig: SettingsSaveConfig | null) => {
    setConfigState(newConfig)
  }, [])

  const clearConfig = useCallback(() => {
    setConfigState(null)
  }, [])

  return (
    <SettingsSaveContext.Provider value={{ config, setConfig, clearConfig }}>
      {children}
    </SettingsSaveContext.Provider>
  )
}

export function useSettingsSaveContext() {
  const ctx = useContext(SettingsSaveContext)
  if (!ctx) {
    throw new Error('useSettingsSaveContext must be used within SettingsSaveProvider')
  }
  return ctx
}

export function useSettingsSaveBar(cfg: SettingsSaveConfig) {
  const { setConfig, clearConfig } = useSettingsSaveContext()

  useEffect(() => {
    setConfig(cfg)
    return () => {
      clearConfig()
    }
  }, [
    cfg.hasChanges,
    cfg.saving,
    cfg.saved,
    cfg.label,
    cfg.onSave,
    cfg.onDiscard,
    setConfig,
    clearConfig,
  ])
}
