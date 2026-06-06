// TODO: Review this file
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type MotionPreference = 'system' | 'reduce' | 'full'

const STORAGE_KEY = 'otix-motion'

const MotionPreferenceContext = createContext<{
  motionPreference: MotionPreference
  setMotionPreference: (value: MotionPreference) => void
}>({
  motionPreference: 'system',
  setMotionPreference: () => {},
})

export const MOTION_OPTIONS: {
  value: MotionPreference
  label: string
  description: string
}[] = [
  { value: 'system', label: 'System', description: 'Follow your device motion settings.' },
  { value: 'full', label: 'Full', description: 'Enable all animations.' },
  { value: 'reduce', label: 'Reduced', description: 'Minimize motion and transitions.' },
]

function getInitialMotionPreference(): MotionPreference {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem(STORAGE_KEY)
  return MOTION_OPTIONS.some((option) => option.value === stored)
    ? (stored as MotionPreference)
    : 'system'
}

function resolveReducedMotion(preference: MotionPreference): boolean {
  if (preference === 'reduce') return true
  if (preference === 'full') return false
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function MotionPreferenceProvider({ children }: { children: ReactNode }) {
  const [motionPreference, setMotionPreference] = useState<MotionPreference>(getInitialMotionPreference)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, motionPreference)
  }, [motionPreference])

  useEffect(() => {
    const apply = () => {
      const reduced = resolveReducedMotion(motionPreference)
      if (reduced) {
        document.documentElement.setAttribute('data-motion-reduced', '')
      } else {
        document.documentElement.removeAttribute('data-motion-reduced')
      }
    }

    apply()

    if (motionPreference === 'system') {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
      const listener = () => apply()
      mql.addEventListener('change', listener)
      return () => mql.removeEventListener('change', listener)
    }
  }, [motionPreference])

  return (
    <MotionPreferenceContext.Provider value={{ motionPreference, setMotionPreference }}>
      {children}
    </MotionPreferenceContext.Provider>
  )
}

export function useMotionPreference() {
  return useContext(MotionPreferenceContext)
}
