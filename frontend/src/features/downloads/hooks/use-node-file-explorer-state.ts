import { useState, useMemo } from 'react'
import { useToast } from '@ui/molecules/toast'
import { isDesktop } from '@/lib/desktop/api'
import { formatBytes } from '@/lib/utils'
import { useNodes } from '../use-node-downloads'
import {
  useCreateNodeFolder,
  useNodeExplorer,
  useRequestNodePermission,
  useSetNodeDownloadPath,
} from '../use-node-explorer'
import {
  isPathEqual,
  parseBreadcrumbs,
  sortExplorerEntries,
} from '../node-explorer-utils'
import type { NodeExplorerEntry } from '../node-explorer-types'

export interface UseNodeFileExplorerStateProps {
  initialNodeId?: number
  initialServerId?: number
  initialPath?: string
}

export const useNodeFileExplorerState = ({
  initialNodeId,
  initialServerId,
  initialPath,
}: UseNodeFileExplorerStateProps = {}) => {
  const { toast } = useToast()
  const desktop = isDesktop()

  const { data: nodes = [], isLoading: nodesLoading } = useNodes()
  const [selectedNodeId, setSelectedNodeId] = useState<number | undefined>(
    () => initialNodeId || initialServerId || nodes[0]?.id,
  )

  const activeNode = useMemo(() => {
    if (selectedNodeId) return nodes.find((s) => s.id === selectedNodeId)
    return nodes[0]
  }, [nodes, selectedNodeId])

  const nodeId = activeNode?.id

  const [currentPath, setCurrentPath] = useState<string | undefined>(initialPath)
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [isConnectShareOpen, setIsConnectShareOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  const {
    data: browseData,
    isLoading: isBrowsing,
    isRefetching,
    refetch,
    error: browseError,
  } = useNodeExplorer(nodeId, currentPath)

  const setDownloadPathMutation = useSetNodeDownloadPath(nodeId)
  const createFolderMutation = useCreateNodeFolder(nodeId)
  const requestPermissionMutation = useRequestNodePermission(nodeId)

  const handleRequestPermission = async (path?: string) => {
    const target = path || browseData?.current_path || currentPath || ''
    try {
      const res = await requestPermissionMutation.mutateAsync({ path: target })
      toast({
        title: res.granted ? 'Permission Granted' : 'Mac Permission Requested',
        description: res.message || 'Check your Mac screen for the system permission prompt.',
        variant: res.granted ? 'success' : 'default',
      })
      refetch()
    } catch (err: any) {
      toast({
        title: 'Permission Request Failed',
        description: err.message || 'Could not communicate with node.',
        variant: 'error',
      })
    }
  }

  const breadcrumbs = useMemo(() => {
    const raw = browseData?.current_path || currentPath || ''
    return parseBreadcrumbs(raw)
  }, [browseData?.current_path, currentPath])

  const sortedEntries = useMemo(() => {
    if (!browseData?.entries) return []
    return sortExplorerEntries(browseData.entries, searchQuery)
  }, [browseData?.entries, searchQuery])

  const isCurrentFolderDownloadTarget = useMemo(() => {
    const current = browseData?.current_path || currentPath
    return isPathEqual(current, browseData?.active_download_path)
  }, [browseData?.current_path, currentPath, browseData?.active_download_path])

  const handleNavigate = (newPath?: string) => {
    setCurrentPath(newPath)
    setSearchQuery('')
    setIsCreatingFolder(false)
    setNewFolderName('')
  }

  const handleSetDownloadLocation = async (targetPath?: string) => {
    const path = targetPath || browseData?.current_path || currentPath
    if (!path) return

    try {
      await setDownloadPathMutation.mutateAsync({
        path,
        create_if_missing: true,
        add_as_library: true,
      })
      toast({
        title: 'Node Download Location Updated',
        description: `All future game downloads on this node will save to ${path}.`,
        variant: 'success',
      })
      refetch()
    } catch (err: any) {
      toast({
        title: 'Failed to set download path',
        description: err.message || 'Could not update node configuration.',
        variant: 'error',
      })
    }
  }

  const handleResetDownloadLocation = async () => {
    try {
      await setDownloadPathMutation.mutateAsync({
        path: './storage/downloads',
        create_if_missing: true,
        add_as_library: false,
      })
      toast({
        title: 'Download Folder Reset',
        description: 'Reverted download location to node default storage/downloads.',
        variant: 'default',
      })
      refetch()
    } catch (err: any) {
      toast({
        title: 'Reset Failed',
        description: err.message || 'Could not update node configuration.',
        variant: 'error',
      })
    }
  }

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFolderName.trim() || !browseData?.current_path) return

    try {
      const res = await createFolderMutation.mutateAsync({
        parent_path: browseData.current_path,
        folder_name: newFolderName.trim(),
      })
      toast({
        title: 'Folder Created',
        description: `Created folder "${newFolderName.trim()}" on node.`,
        variant: 'success',
      })
      setNewFolderName('')
      setIsCreatingFolder(false)
      await refetch()
      if (res?.path) {
        handleNavigate(res.path)
      }
    } catch (err: any) {
      toast({
        title: 'Failed to create folder',
        description:
          err?.response?.data?.detail ||
          err?.response?.data?.error ||
          err.message ||
          'Folder name may be invalid or already exists.',
        variant: 'error',
      })
    }
  }

  const handleDownloadFile = async (entry: NodeExplorerEntry) => {
    if (!activeNode) return
    const targetUrl = (activeNode.primaryUrl || '').replace(/\/+$/, '')
    const tokenParam = activeNode.authToken
      ? `&token=${encodeURIComponent(activeNode.authToken)}`
      : ''
    const directDownloadUrl = `${targetUrl}/api/v1/explorer/download?path=${encodeURIComponent(entry.path)}${tokenParam}`

    if (desktop && window.desktopAPI?.downloadsRemoteStart) {
      try {
        const destDir = localStorage.getItem('otix:games-download-dir') || undefined
        await window.desktopAPI.downloadsRemoteStart({
          serverUrl: targetUrl,
          fileId: `explorer_${entry.name.replace(/\W+/g, '_')}`,
          filename: entry.name,
          filesize: entry.size,
          gameTitle: entry.name.replace(/\.[^/.]+$/, ''),
          destDir,
        })
        toast({
          title: 'Download Started',
          description: `Streaming ${entry.name} from ${activeNode.name} to your local device.`,
          variant: 'success',
        })
        return
      } catch (err: any) {
        console.warn('Desktop download trigger failed, falling back to direct stream:', err)
      }
    }

    const link = document.createElement('a')
    link.href = directDownloadUrl
    link.download = entry.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: 'Streaming from Node',
      description: `Downloading ${entry.name} (${formatBytes(entry.size)}) to this device.`,
      variant: 'default',
    })
  }

  return {
    nodes,
    nodesLoading,
    selectedNodeId,
    setSelectedNodeId,
    activeNode,
    nodeId,
    currentPath,
    setCurrentPath,
    searchQuery,
    setSearchQuery,
    isCreatingFolder,
    setIsCreatingFolder,
    isConnectShareOpen,
    setIsConnectShareOpen,
    newFolderName,
    setNewFolderName,
    browseData,
    isBrowsing,
    isRefetching,
    refetch,
    browseError,
    breadcrumbs,
    sortedEntries,
    isCurrentFolderDownloadTarget,
    handleNavigate,
    handleSetDownloadLocation,
    handleResetDownloadLocation,
    handleCreateFolder,
    handleDownloadFile,
    handleRequestPermission,
    isSettingDownloadPath: setDownloadPathMutation.isPending,
    isCreatingFolderPending: createFolderMutation.isPending,
    isRequestingPermission: requestPermissionMutation.isPending,
  }
}
