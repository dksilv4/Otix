export type MotionPreference = 'system' | 'reduce' | 'full'

export const MOTION_STORAGE_KEY = 'otix-motion'

export const MOTION_OPTIONS: {
  value: MotionPreference
  label: string
  description: string
}[] = [
  { value: 'system', label: 'System', description: 'Follow your device motion settings.' },
  { value: 'full', label: 'Full', description: 'Enable all animations.' },
  { value: 'reduce', label: 'Reduced', description: 'Minimize motion and transitions.' },
]

export const getInitialMotionPreference = (): MotionPreference => {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem(MOTION_STORAGE_KEY)
  return MOTION_OPTIONS.some((option) => option.value === stored)
    ? (stored as MotionPreference)
    : 'system'
}

export const resolveReducedMotion = (preference: MotionPreference): boolean => {
  if (preference === 'reduce') return true
  if (preference === 'full') return false
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
