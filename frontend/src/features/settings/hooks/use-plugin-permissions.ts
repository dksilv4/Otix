import { useState, useEffect, useCallback } from 'react'

export interface PermissionRequest {
  requestId: string
  pluginId: string
  pluginName: string
  permission: string
  reason: string
}

export interface UsePluginPermissionsReturn {
  currentRequest: PermissionRequest | null
  isModalOpen: boolean
  handleAllowOnce: (requestId: string) => void
  handleAllowAlways: (requestId: string) => void
  handleDeny: (requestId: string) => void
  handleClose: () => void
}

interface PluginPermissionAPI {
  onPermissionRequest?: (cb: (request: PermissionRequest) => void) => () => void
  respondToPermission?: (requestId: string, opts: { granted: boolean; duration?: string }) => Promise<void>
}

export function usePluginPermissions(): UsePluginPermissionsReturn {
  const [currentRequest, setCurrentRequest] = useState<PermissionRequest | null>(null)

  useEffect(() => {
    const api = (window as Window).desktopAPI?.plugin as PluginPermissionAPI | undefined
    if (!api?.onPermissionRequest) return

    const unsubscribe = api.onPermissionRequest((request) => {
      setCurrentRequest(request)
    })

    return () => { unsubscribe() }
  }, [])

  const clearRequest = useCallback(() => {
    setCurrentRequest(null)
  }, [])

  const handleAllowOnce = useCallback((requestId: string) => {
    const api = (window as Window).desktopAPI?.plugin as PluginPermissionAPI | undefined
    api?.respondToPermission?.(requestId, { granted: true, duration: 'once' }).catch(() => {})
    clearRequest()
  }, [clearRequest])

  const handleAllowAlways = useCallback((requestId: string) => {
    const api = (window as Window).desktopAPI?.plugin as PluginPermissionAPI | undefined
    api?.respondToPermission?.(requestId, { granted: true, duration: 'always' }).catch(() => {})
    clearRequest()
  }, [clearRequest])

  const handleDeny = useCallback((requestId: string) => {
    const api = (window as Window).desktopAPI?.plugin as PluginPermissionAPI | undefined
    api?.respondToPermission?.(requestId, { granted: false }).catch(() => {})
    clearRequest()
  }, [clearRequest])

  const handleClose = useCallback(() => {
    clearRequest()
  }, [clearRequest])

  return {
    currentRequest,
    handleAllowOnce,
    handleAllowAlways,
    handleDeny,
    handleClose,
    isModalOpen: currentRequest !== null,
  }
}
