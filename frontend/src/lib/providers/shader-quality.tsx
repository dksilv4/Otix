import { createContext, useEffect, useState, type ReactNode } from 'react'
import {
  type ShaderQualityPreference,
  SHADER_QUALITY_STORAGE_KEY,
  SHADER_QUALITY_OPTIONS,
  getInitialShaderQuality,
} from '@/lib/utils/shader-quality'

export type { ShaderQualityPreference }
export { SHADER_QUALITY_OPTIONS }

export const ShaderQualityContext = createContext<{
  shaderQuality: ShaderQualityPreference
  setShaderQuality: (value: ShaderQualityPreference) => void
}>({
  shaderQuality: 'auto',
  setShaderQuality: () => {},
})

export const ShaderQualityProvider = ({ children }: { children: ReactNode }) => {
  const [shaderQuality, setShaderQuality] = useState<ShaderQualityPreference>(getInitialShaderQuality)

  useEffect(() => {
    localStorage.setItem(SHADER_QUALITY_STORAGE_KEY, shaderQuality)
  }, [shaderQuality])

  return (
    <ShaderQualityContext.Provider value={{ shaderQuality, setShaderQuality }}>
      {children}
    </ShaderQualityContext.Provider>
  )
};

export { useShaderQuality } from './hooks/use-shader-quality'

