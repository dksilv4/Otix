import { useDesktopPlatform } from './platform'
import type { ReactNode } from 'react'

export function Desktop({ children }: { children: ReactNode }) {
  const { isDesktop } = useDesktopPlatform()
  if (!isDesktop) return null
  return <>{children}</>
}
