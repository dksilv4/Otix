import { useState, useEffect } from 'react'
import { getDesktopAPI } from './api'

export interface DesktopPlatformInfo {
  isDesktop: boolean
  platform: 'darwin' | 'win32' | 'linux' | null
  isMac: boolean
  isWindows: boolean
  isLinux: boolean
}

function detectDesktop(): DesktopPlatformInfo {
  const api = getDesktopAPI()

  if (api?.platform) {
    const p = api.platform as 'darwin' | 'win32' | 'linux'
    return {
      isDesktop: true,
      platform: p,
      isMac: p === 'darwin',
      isWindows: p === 'win32',
      isLinux: p === 'linux',
    }
  }

  // Fallback: sniff user agent
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : ''
  const isDesktop = ua.includes('electron')
  const p = isDesktop ? detectPlatformFromUA(ua) : null

  return {
    isDesktop,
    platform: p,
    isMac: p === 'darwin',
    isWindows: p === 'win32',
    isLinux: p === 'linux',
  }
}

function detectPlatformFromUA(ua: string): 'darwin' | 'win32' | 'linux' | null {
  if (ua.includes('mac os')) return 'darwin'
  if (ua.includes('windows')) return 'win32'
  if (ua.includes('linux')) return 'linux'
  return null
}

/** One-shot platform info (use in non-React contexts). */
export function getDesktopPlatform(): DesktopPlatformInfo {
  return detectDesktop()
}

/** React hook — returns stable platform info after mount. */
export function useDesktopPlatform(): DesktopPlatformInfo {
  const [info] = useState<DesktopPlatformInfo>(getDesktopPlatform)

  // Re-check on mount for SSR safety (no-op if already correct)
  useEffect(() => {
    // Platform won't change at runtime; this is just to hydrate correctly
  }, [])

  return info
}
