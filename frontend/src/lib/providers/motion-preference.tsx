import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  type MotionPreference,
  MOTION_STORAGE_KEY,
  MOTION_OPTIONS,
  getInitialMotionPreference,
  resolveReducedMotion,
} from '@/lib/utils/motion'

export type { MotionPreference }
export { MOTION_OPTIONS }

const MotionPreferenceContext = createContext<{
  motionPreference: MotionPreference
  setMotionPreference: (value: MotionPreference) => void
}>({
  motionPreference: 'system',
  setMotionPreference: () => {},
})

export const MotionPreferenceProvider = ({ children }: { children: ReactNode }) => {
  const [motionPreference, setMotionPreference] = useState<MotionPreference>(getInitialMotionPreference)

  useEffect(() => {
    localStorage.setItem(MOTION_STORAGE_KEY, motionPreference)
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

export const useMotionPreference = () => {
  return useContext(MotionPreferenceContext)
}

