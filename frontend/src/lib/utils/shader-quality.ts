export type ShaderQualityPreference = 'auto' | 'low' | 'medium' | 'high' | 'ultra'

export const SHADER_QUALITY_STORAGE_KEY = 'otix-shader-quality'

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

export const getInitialShaderQuality = (): ShaderQualityPreference => {
  if (typeof window === 'undefined') return 'auto'
  const stored = localStorage.getItem(SHADER_QUALITY_STORAGE_KEY)
  return SHADER_QUALITY_OPTIONS.some((option) => option.value === stored)
    ? (stored as ShaderQualityPreference)
    : 'auto'
}
