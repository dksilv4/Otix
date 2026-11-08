import { useState } from 'react'
import { getPlatformInfo, type PlatformInfo } from './platform'

export const usePlatform = (): PlatformInfo => {
  const [platformInfo] = useState<PlatformInfo>(getPlatformInfo)
  return platformInfo
}
