import { useEffect } from 'react'
import { App } from '@capacitor/app'
import { isNativeMobile } from '@/lib/platform'
import { closeExternalBrowser } from '@/lib/utils/open-external'

export interface DeepLinkData {
  action: string
  params: Record<string, string>
}

export function parseDeepLinkUrl(rawUrl: string): DeepLinkData | null {
  try {
    const cleaned = rawUrl.replace(/^otix:\/\//, '')
    const [actionPart, queryPart] = cleaned.split('?')
    const params: Record<string, string> = {}
    if (queryPart) {
      const searchParams = new URLSearchParams(queryPart)
      searchParams.forEach((val, key) => {
        params[key] = val
      })
    }
    return {
      action: actionPart.replace(/^\/+|\/+$/g, ''),
      params,
    }
  } catch {
    return null
  }
}

export function useDeepLink(handler: (data: DeepLinkData) => void) {
  useEffect(() => {
    // 1. Electron Desktop deep link
    const desktopApi = window.desktopAPI as unknown as
      | { onDeepLink: (cb: (data: DeepLinkData) => void) => () => void }
      | undefined

    let desktopDispose: (() => void) | undefined
    if (desktopApi?.onDeepLink) {
      desktopDispose = desktopApi.onDeepLink((data) => {
        handler(data)
      })
    }

    // 2. Native Mobile (Capacitor iOS & Android) deep link
    let mobileListenerHandle: { remove: () => Promise<void> } | undefined
    if (isNativeMobile()) {
      App.addListener('appUrlOpen', (event) => {
        void closeExternalBrowser()
        const parsed = parseDeepLinkUrl(event.url)
        if (parsed) {
          handler(parsed)
        }
      }).then((handle) => {
        mobileListenerHandle = handle
      }).catch(() => {})
    }

    return () => {
      if (desktopDispose) desktopDispose()
      if (mobileListenerHandle) void mobileListenerHandle.remove()
    }
  }, [handler])
}
