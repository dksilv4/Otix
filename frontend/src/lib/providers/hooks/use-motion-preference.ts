import { useContext } from 'react'
import { MotionPreferenceContext } from '../motion-preference'

export const useMotionPreference = () => {
  return useContext(MotionPreferenceContext)
}
