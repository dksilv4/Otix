import { useContext } from 'react'
import { ShaderQualityContext } from '../shader-quality'

export const useShaderQuality = () => {
  return useContext(ShaderQualityContext)
}
