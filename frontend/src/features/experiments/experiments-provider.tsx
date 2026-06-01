import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { EXPERIMENTS, type Maturity, type ExperimentDefinition } from './experiments.types'

const STORAGE_KEY = 'otix-experiments'

interface ExperimentsState {
  enabled: Record<string, boolean>
}

const ExperimentsContext = createContext<{
  isEnabled: (key: string) => boolean
  setEnabled: (key: string, value: boolean) => void
  experiments: ExperimentDefinition[]
}>({
  isEnabled: () => false,
  setEnabled: () => {},
  experiments: [],
})

function getInitialState(): ExperimentsState {
  if (typeof window === 'undefined') return { enabled: {} }
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed && typeof parsed === 'object' && parsed.enabled && typeof parsed.enabled === 'object') {
        return { enabled: parsed.enabled as Record<string, boolean> }
      }
    }
  } catch {
    // corrupted data, fall through to defaults
  }
  return { enabled: {} }
}

function resolveEnabled(key: string, stored: ExperimentsState): boolean {
  if (key in stored.enabled) return stored.enabled[key]
  const def = EXPERIMENTS.find((e) => e.key === key)
  return def?.defaultEnabled ?? false
}

export function ExperimentsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ExperimentsState>(getInitialState)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const isEnabled = useCallback(
    (key: string) => resolveEnabled(key, state),
    [state],
  )

  const setEnabled = useCallback((key: string, value: boolean) => {
    setState((prev) => ({
      enabled: { ...prev.enabled, [key]: value },
    }))
  }, [])

  return (
    <ExperimentsContext.Provider value={{ isEnabled, setEnabled, experiments: EXPERIMENTS }}>
      {children}
    </ExperimentsContext.Provider>
  )
}

export function useExperiment(key: string) {
  const { isEnabled } = useContext(ExperimentsContext)
  const def = EXPERIMENTS.find((e) => e.key === key)
  return {
    enabled: isEnabled(key),
    maturity: def?.maturity ?? ('production' as Maturity),
    definition: def,
  }
}

export function useExperiments() {
  return useContext(ExperimentsContext)
}
