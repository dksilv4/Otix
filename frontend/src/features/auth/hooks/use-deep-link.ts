import { useEffect } from 'react'

interface DeepLinkData {
  action: string
  params: Record<string, string>
}

export function useDeepLink(handler: (data: DeepLinkData) => void) {
  useEffect(() => {
    const desktopApi = window.desktopAPI as unknown as
      | { onDeepLink: (cb: (data: DeepLinkData) => void) => () => void }
      | undefined

    if (!desktopApi?.onDeepLink) return

    const dispose = desktopApi.onDeepLink((data) => {
      handler(data)
    })

    return () => dispose()
  }, [handler])
}
