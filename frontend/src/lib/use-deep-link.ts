import { useEffect } from 'react'

interface DeepLinkData {
  action: string
  params: Record<string, string>
}

/**
 * Listen for Electron deep-link events (otix:// protocol).
 *
 * Used to handle OAuth callback data when the system redirects back
 * to the Electron app via the custom protocol handler.
 */
export function useDeepLink(handler: (data: DeepLinkData) => void) {
  useEffect(() => {
    const desktopApi = (window as any).desktopAPI as
      | { onDeepLink: (cb: (data: DeepLinkData) => void) => () => void }
      | undefined

    if (!desktopApi?.onDeepLink) return

    const dispose = desktopApi.onDeepLink((data) => {
      handler(data)
    })

    return () => dispose()
  }, [handler])
}
