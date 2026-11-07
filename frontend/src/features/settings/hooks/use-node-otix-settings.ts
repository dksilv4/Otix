import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { useToast } from '@ui/molecules/toast'

export const useNodeOtixSettings = (remoteNodeId: number | null) => {
  const { toast } = useToast()
  const [writeOtixAfterScan, setWriteOtixAfterScan] = useState(false)
  const [downloadOtixImages, setDownloadOtixImages] = useState(false)

  useEffect(() => {
    let cancelled = false
    const loadOtixSettings = async () => {
      if (!remoteNodeId) {
        setWriteOtixAfterScan(false)
        setDownloadOtixImages(false)
        return
      }
      try {
        const { data } = await apiClient.get<{
          writeOtixAfterScan?: boolean
          downloadOtixImages?: boolean
        }>(`/library/nodes/${remoteNodeId}/otix/settings`)
        if (cancelled) return
        if (typeof data?.writeOtixAfterScan === 'boolean') {
          setWriteOtixAfterScan(data.writeOtixAfterScan)
        }
        if (typeof data?.downloadOtixImages === 'boolean') {
          setDownloadOtixImages(data.downloadOtixImages)
        }
      } catch {
        // Node may be offline or on an older build
      }
    }
    void loadOtixSettings()
    return () => {
      cancelled = true
    }
  }, [remoteNodeId])

  const persistOtixSettings = async (next: {
    writeOtixAfterScan?: boolean
    downloadOtixImages?: boolean
  }) => {
    if (!remoteNodeId) return
    try {
      const { data } = await apiClient.post<{
        writeOtixAfterScan?: boolean
        downloadOtixImages?: boolean
      }>(`/library/nodes/${remoteNodeId}/otix/settings`, next)
      if (typeof data?.writeOtixAfterScan === 'boolean') {
        setWriteOtixAfterScan(data.writeOtixAfterScan)
      }
      if (typeof data?.downloadOtixImages === 'boolean') {
        setDownloadOtixImages(data.downloadOtixImages)
      }
    } catch (err) {
      console.error('Failed to save otix settings:', err)
      toast({
        title: 'Could not save setting',
        description: 'Otix Node may be offline or needs an update.',
        variant: 'error',
      })
    }
  }

  return {
    writeOtixAfterScan,
    setWriteOtixAfterScan,
    downloadOtixImages,
    setDownloadOtixImages,
    persistOtixSettings,
  }
}
