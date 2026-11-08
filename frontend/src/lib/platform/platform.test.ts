import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { getAppPlatform, getPlatformInfo, isNativeMobile, isIOS, isAndroid } from './platform'
import * as desktopApi from '../desktop/api'

describe('platform utilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('detects iOS native mobile platform correctly', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios')

    expect(getAppPlatform()).toBe('ios')
    expect(isNativeMobile()).toBe(true)
    expect(isIOS()).toBe(true)
    expect(isAndroid()).toBe(false)

    const info = getPlatformInfo()
    expect(info.platform).toBe('ios')
    expect(info.isNativeMobile).toBe(true)
    expect(info.isIOS).toBe(true)
    expect(info.isAndroid).toBe(false)
    expect(info.isDesktop).toBe(false)
    expect(info.isWeb).toBe(false)
  })

  it('detects Android native mobile platform correctly', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android')

    expect(getAppPlatform()).toBe('android')
    expect(isNativeMobile()).toBe(true)
    expect(isIOS()).toBe(false)
    expect(isAndroid()).toBe(true)

    const info = getPlatformInfo()
    expect(info.platform).toBe('android')
    expect(info.isNativeMobile).toBe(true)
    expect(info.isIOS).toBe(false)
    expect(info.isAndroid).toBe(true)
    expect(info.isDesktop).toBe(false)
  })

  it('detects Electron desktop environment', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false)
    vi.spyOn(desktopApi, 'getDesktopAPI').mockReturnValue({
      platform: 'darwin',
    } as unknown as ReturnType<typeof desktopApi.getDesktopAPI>)

    expect(getAppPlatform()).toBe('desktop')
    expect(isNativeMobile()).toBe(false)

    const info = getPlatformInfo()
    expect(info.platform).toBe('desktop')
    expect(info.isDesktop).toBe(true)
    expect(info.isMac).toBe(true)
    expect(info.isNativeMobile).toBe(false)
  })

  it('falls back to web platform when neither mobile nor desktop', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false)
    vi.spyOn(desktopApi, 'getDesktopAPI').mockReturnValue(undefined)

    expect(getAppPlatform()).toBe('web')
    expect(isNativeMobile()).toBe(false)

    const info = getPlatformInfo()
    expect(info.platform).toBe('web')
    expect(info.isWeb).toBe(true)
    expect(info.isNativeMobile).toBe(false)
    expect(info.isDesktop).toBe(false)
  })
})
