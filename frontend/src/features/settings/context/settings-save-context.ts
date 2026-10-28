import { createContext, createElement, useContext, useState, useEffect, useCallback, useRef, useId, useMemo, type ReactNode } from 'react'

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
  registerConfig: (id: string, config: SettingsSaveConfig) => void
  unregisterConfig: (id: string) => void
  setConfig: (config: SettingsSaveConfig | null) => void
  clearConfig: () => void
}

const SettingsSaveContext = createContext<SettingsSaveContextType | undefined>(undefined)

export const SettingsSaveProvider = ({ children }: { children: ReactNode }) => {
  const [registry, setRegistry] = useState<Record<string, SettingsSaveConfig>>({})
  const [legacyConfig, setLegacyConfig] = useState<SettingsSaveConfig | null>(null)

  const registerConfig = useCallback((id: string, cfg: SettingsSaveConfig) => {
    setRegistry((prev) => {
      const cur = prev[id]
      if (
        cur &&
        cur.hasChanges === cfg.hasChanges &&
        cur.saving === cfg.saving &&
        cur.saved === cfg.saved &&
        cur.label === cfg.label
      ) {
        return prev
      }
      return { ...prev, [id]: cfg }
    })
  }, [])

  const unregisterConfig = useCallback((id: string) => {
    setRegistry((prev) => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const setConfig = useCallback((newConfig: SettingsSaveConfig | null) => {
    setLegacyConfig(newConfig)
  }, [])

  const clearConfig = useCallback(() => {
    setLegacyConfig(null)
  }, [])

  const combinedConfig = useMemo<SettingsSaveConfig | null>(() => {
    const allConfigs = Object.values(registry)
    if (legacyConfig) allConfigs.push(legacyConfig)

    if (allConfigs.length === 0) return null

    const hasChanges = allConfigs.some((c) => c.hasChanges)
    const saving = allConfigs.some((c) => c.saving)
    const saved = allConfigs.some((c) => c.saved)
    const label = allConfigs.find((c) => c.label)?.label || 'Save Changes'

    return {
      hasChanges,
      saving,
      saved,
      label,
      onSave: async () => {
        for (const c of allConfigs) {
          if (c.hasChanges || c.onSave) {
            await c.onSave?.()
          }
        }
      },
      onDiscard: () => {
        for (const c of allConfigs) {
          c.onDiscard?.()
        }
      },
    }
  }, [registry, legacyConfig])

  const value = useMemo(
    () => ({
      config: combinedConfig,
      registerConfig,
      unregisterConfig,
      setConfig,
      clearConfig,
    }),
    [combinedConfig, registerConfig, unregisterConfig, setConfig, clearConfig],
  )

  return createElement(SettingsSaveContext.Provider, { value }, children)
}

export function useSettingsSaveContext() {
  const ctx = useContext(SettingsSaveContext)
  if (!ctx) {
    throw new Error('useSettingsSaveContext must be used within SettingsSaveProvider')
  }
  return ctx
}

export function useSettingsSaveBar(cfg: SettingsSaveConfig) {
  const ctx = useContext(SettingsSaveContext)
  const id = useId()
  const onSaveRef = useRef(cfg.onSave)
  const onDiscardRef = useRef(cfg.onDiscard)
  useEffect(() => {
    onSaveRef.current = cfg.onSave
    onDiscardRef.current = cfg.onDiscard
  })

  const registerConfig = ctx?.registerConfig
  const unregisterConfig = ctx?.unregisterConfig

  useEffect(() => {
    if (!registerConfig || !unregisterConfig) return
    registerConfig(id, {
      hasChanges: cfg.hasChanges,
      saving: cfg.saving,
      saved: cfg.saved,
      label: cfg.label,
      onSave: () => onSaveRef.current?.(),
      onDiscard: () => onDiscardRef.current?.(),
    })
    return () => {
      unregisterConfig(id)
    }
  }, [
    id,
    registerConfig,
    unregisterConfig,
    cfg.hasChanges,
    cfg.saving,
    cfg.saved,
    cfg.label,
  ])
}
