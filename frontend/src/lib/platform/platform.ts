import { Capacitor } from '@capacitor/core'
import { getDesktopAPI } from '../desktop/api'

export type AppRuntimePlatform = 'ios' | 'android' | 'desktop' | 'web'

export interface PlatformInfo {
  platform: AppRuntimePlatform
  isNativeMobile: boolean
  isIOS: boolean
  isAndroid: boolean
  isDesktop: boolean
  isWeb: boolean
  isMac: boolean
  isWindows: boolean
  isLinux: boolean
}

export const getAppPlatform = (): AppRuntimePlatform => {
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform()
    if (platform === 'ios') return 'ios'
    if (platform === 'android') return 'android'
  }
  const desktopApi = getDesktopAPI()
  if (desktopApi?.platform) return 'desktop'
  if (typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron')) {
    return 'desktop'
  }
  return 'web'
}

export const isNativeMobile = (): boolean => Capacitor.isNativePlatform()

export const isIOS = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'

export const isAndroid = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

export const getPlatformInfo = (): PlatformInfo => {
  const runtime = getAppPlatform()
  const nativeMobile = runtime === 'ios' || runtime === 'android'
  const desktop = runtime === 'desktop'
  const web = runtime === 'web'
  const ios = runtime === 'ios'
  const android = runtime === 'android'

  const desktopApi = getDesktopAPI()
  const desktopPlatform = desktopApi?.platform
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : ''
  const isMac = desktopPlatform === 'darwin' || (desktop && ua.includes('mac os')) || ios
  const isWindows = desktopPlatform === 'win32' || (desktop && ua.includes('windows'))
  const isLinux = desktopPlatform === 'linux' || (desktop && ua.includes('linux'))

  return {
    platform: runtime,
    isNativeMobile: nativeMobile,
    isIOS: ios,
    isAndroid: android,
    isDesktop: desktop,
    isWeb: web,
    isMac,
    isWindows,
    isLinux,
  }
}
