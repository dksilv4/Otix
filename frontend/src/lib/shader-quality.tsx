import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ShaderQualityPreference = 'auto' | 'low' | 'medium' | 'high' | 'ultra'

const STORAGE_KEY = 'otix-shader-quality'

const ShaderQualityContext = createContext<{
  shaderQuality: ShaderQualityPreference
  setShaderQuality: (value: ShaderQualityPreference) => void
}>({
  shaderQuality: 'auto',
  setShaderQuality: () => {},
})

export const SHADER_QUALITY_OPTIONS: {
  value: ShaderQualityPreference
  label: string
  description: string
}[] = [
  { value: 'auto', label: 'Auto', description: 'Choose quality based on the current machine.' },
  { value: 'low', label: 'Low', description: 'Prioritize stability on weaker hardware.' },
  { value: 'medium', label: 'Medium', description: 'Balanced quality and performance.' },
  { value: 'high', label: 'High', description: 'Sharper effect for capable machines.' },
  { value: 'ultra', label: 'Ultra', description: 'Highest detail and render cost.' },
]

function getInitialShaderQuality(): ShaderQualityPreference {
  if (typeof window === 'undefined') return 'auto'
  const stored = localStorage.getItem(STORAGE_KEY)
  return SHADER_QUALITY_OPTIONS.some((option) => option.value === stored)
    ? (stored as ShaderQualityPreference)
    : 'auto'
}

export function ShaderQualityProvider({ children }: { children: ReactNode }) {
  const [shaderQuality, setShaderQuality] = useState<ShaderQualityPreference>(getInitialShaderQuality)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, shaderQuality)
  }, [shaderQuality])

  return (
    <ShaderQualityContext.Provider value={{ shaderQuality, setShaderQuality }}>
      {children}
    </ShaderQualityContext.Provider>
  )
}

export function useShaderQuality() {
  return useContext(ShaderQualityContext)
}
