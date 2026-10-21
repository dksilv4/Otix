import { useState, useEffect } from 'react'
import { detectUserPlatform } from '../utils/downloads-utils'
import type { PlatformId } from '../types'

export const useDetectedPlatform = (): {
  detectedPlatform: 'windows' | 'macos' | 'linux'
  activeTab: PlatformId
  setActiveTab: (tab: PlatformId) => void
} => {
  const [detectedPlatform, setDetectedPlatform] = useState<'windows' | 'macos' | 'linux'>('windows')
  const [activeTab, setActiveTab] = useState<PlatformId>('windows')

  useEffect(() => {
    const platform = detectUserPlatform()
    setDetectedPlatform(platform)
    setActiveTab(platform)
  }, [])

  return {
    detectedPlatform,
    activeTab,
    setActiveTab,
  }
}
