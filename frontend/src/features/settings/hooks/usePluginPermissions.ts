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
  handleAllowOnce: () => void
  handleAllowAlways: () => void
  handleDeny: () => void
  isModalOpen: boolean
}

export function usePluginPermissions(): UsePluginPermissionsReturn {
  const [currentRequest, setCurrentRequest] = useState<PermissionRequest | null>(null)

  useEffect(() => {
    const api = (window as Window).desktopAPI?.plugin
    if (!api?.onPermissionRequest) return

    const unsubscribe = api.onPermissionRequest((request) => {
      setCurrentRequest(request)
      return () => {
        // Cleanup function returned by the caller if needed
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const clearRequest = useCallback(() => {
    setCurrentRequest(null)
  }, [])

  const handleAllowOnce = useCallback(() => {
    const req = currentRequest
    if (!req) return
    const api = (window as Window).desktopAPI?.plugin
    api?.respondToPermission(req.requestId, { granted: true, duration: 'once' })
      .catch(() => {})
    clearRequest()
  }, [currentRequest, clearRequest])

  const handleAllowAlways = useCallback(() => {
    const req = currentRequest
    if (!req) return
    const api = (window as Window).desktopAPI?.plugin
    api?.respondToPermission(req.requestId, { granted: true, duration: 'always' })
      .catch(() => {})
    clearRequest()
  }, [currentRequest, clearRequest])

  const handleDeny = useCallback(() => {
    const req = currentRequest
    if (!req) return
    const api = (window as Window).desktopAPI?.plugin
    api?.respondToPermission(req.requestId, { granted: false })
      .catch(() => {})
    clearRequest()
  }, [currentRequest, clearRequest])

  return {
    currentRequest,
    handleAllowOnce,
    handleAllowAlways,
    handleDeny,
    isModalOpen: currentRequest !== null,
  }
}
