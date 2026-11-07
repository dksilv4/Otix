import { useState, useCallback, useRef } from 'react'
import { apiClient } from '@/lib/api/client'
import {
  type PreviewItem,
  type OrganizeProgress,
  chunkArray,
  getOrganizerApi,
} from '../utils/organize-test-run'

export interface UseOrganizeExecutionProps {
  nodeId?: number | null
  actionableItems: PreviewItem[]
  selectedFolder: string
  deleteEmptyFolders: boolean
  fetchRealPreview: (folderPath?: string, preserveExecuted?: boolean) => Promise<void>
  setItems: React.Dispatch<React.SetStateAction<PreviewItem[]>>
  queryClient: any
}

export const useOrganizeExecution = ({
  nodeId,
  actionableItems,
  selectedFolder,
  deleteEmptyFolders,
  fetchRealPreview,
  setItems,
  queryClient,
}: UseOrganizeExecutionProps) => {
  const [executing, setExecuting] = useState(false)
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [executedCount, setExecutedCount] = useState<number | null>(null)
  const [progress, setProgress] = useState<OrganizeProgress | null>(null)
  const abortExecutionRef = useRef(false)

  const handleStopExecute = useCallback(() => {
    abortExecutionRef.current = true
  }, [])

  const handleExecute = useCallback(async () => {
    if (actionableItems.length === 0) return
    setExecuting(true)
    setExecutionError(null)
    setExecutedCount(null)
    abortExecutionRef.current = false
    const desktopApi = getOrganizerApi()

    const total = actionableItems.length
    let totalSucceeded = 0
    const failedErrors: string[] = []
    const batches = chunkArray(actionableItems, 5)
    let fallbackToDesktop = false

    setProgress({
      total,
      current: 0,
      percent: 0,
      currentName: 'Preparing items to organize...',
      succeeded: 0,
      failed: 0,
    })

    try {
      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        if (abortExecutionRef.current) {
          break
        }

        const batch = batches[bIdx]
        const isLastBatch = bIdx === batches.length - 1
        const cleanEmpty = isLastBatch ? deleteEmptyFolders : false
        const currentName =
          batch.length === 1
            ? batch[0].sourceFilename
            : `${batch[0].sourceFilename} (+${batch.length - 1} more)`

        setProgress({
          total,
          current: totalSucceeded + failedErrors.length,
          percent: Math.round(((totalSucceeded + failedErrors.length) / total) * 100),
          currentName: `Moving: ${currentName}`,
          succeeded: totalSucceeded,
          failed: failedErrors.length,
        })

        const payloadItems = batch.map((i) => ({
          sourcePath: i.sourcePath,
          targetPath: i.targetPath,
        }))

        let executedBatch = false

        if (!fallbackToDesktop && nodeId && nodeId > 0) {
          const payload = {
            items: payloadItems,
            deleteEmptyFolders: cleanEmpty,
          }
          try {
            const res = await apiClient.post<any>(
              `/library/nodes/${nodeId}/organize/execute`,
              payload,
              { timeout: 120_000 },
            )
            const results = res?.data?.results || res?.data
            if (Array.isArray(results)) {
              results.forEach((r: any) => {
                if (r.success !== false) {
                  totalSucceeded++
                } else if (r.error) {
                  failedErrors.push(r.error)
                }
              })
            } else {
              totalSucceeded += batch.length
            }
            executedBatch = true
          } catch (netErr: any) {
            const errData = netErr?.response?.data
            const rawErr = (
              typeof errData === 'string'
                ? errData
                : errData?.error || errData?.detail || netErr?.message || ''
            ).toLowerCase()
            const status = netErr?.response?.status

            const isNetworkUnreachable =
              status === 500 ||
              status === 502 ||
              status === 503 ||
              status === 504 ||
              status === 400 ||
              rawErr.includes('network_unreachable') ||
              rawErr.includes('node_unreachable') ||
              rawErr.includes('node_offline') ||
              rawErr.includes('connection_refused') ||
              rawErr.includes('econnrefused') ||
              rawErr.includes('timeout') ||
              rawErr.includes('does not support server-side') ||
              netErr?.code === 'ECONNREFUSED' ||
              netErr?.code === 'ERR_NETWORK'

            if (desktopApi?.executeOrganization) {
              fallbackToDesktop = true
            } else {
              const msg = isNetworkUnreachable
                ? 'Node server is offline or unreachable. Please ensure the node daemon is running.'
                : errData?.error ||
                  errData?.detail ||
                  netErr?.message ||
                  'Failed to execute organization movements on node server.'
              failedErrors.push(msg)
              break
            }
          }
        }

        if (!executedBatch && desktopApi?.executeOrganization) {
          try {
            const desktopResults = await desktopApi.executeOrganization(payloadItems, cleanEmpty)
            if (Array.isArray(desktopResults)) {
              desktopResults.forEach((r: any) => {
                if (r.success) {
                  totalSucceeded++
                } else if (r.error) {
                  failedErrors.push(r.error)
                }
              })
            } else {
              totalSucceeded += batch.length
            }
            executedBatch = true
          } catch (ipcErr: any) {
            failedErrors.push(ipcErr?.message || 'Local desktop organization failed.')
            break
          }
        } else if (!executedBatch && !desktopApi?.executeOrganization && (!nodeId || nodeId <= 0)) {
          failedErrors.push('No organizer execution engine available.')
          break
        }

        // Live mark moved batch items as already_organized in items state
        if (executedBatch) {
          const movedSources = new Set(batch.map((b) => b.sourcePath.toLowerCase()))
          setItems((prevItems) =>
            prevItems.map((item) =>
              movedSources.has(item.sourcePath.toLowerCase())
                ? { ...item, status: 'already_organized' as const }
                : item,
            ),
          )
        }

        setProgress({
          total,
          current: Math.min(total, totalSucceeded + failedErrors.length),
          percent: Math.min(100, Math.round(((totalSucceeded + failedErrors.length) / total) * 100)),
          currentName: `Moved: ${currentName}`,
          succeeded: totalSucceeded,
          failed: failedErrors.length,
        })
      }

      if (failedErrors.length > 0 && totalSucceeded === 0) {
        setExecutionError(failedErrors[0])
      } else {
        if (failedErrors.length > 0) {
          setExecutionError(`Organized ${totalSucceeded} game artifacts, but some operations failed: ${failedErrors[0]}`)
        }
        setExecutedCount(totalSucceeded)
        void fetchRealPreview(selectedFolder, true)
        queryClient?.invalidateQueries({ queryKey: ['server-games'] })
        queryClient?.invalidateQueries({ queryKey: ['node-games'] })
        queryClient?.invalidateQueries({ queryKey: ['local-games'] })
        queryClient?.invalidateQueries({ queryKey: ['library', 'matches'] })
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('scanned-games-updated'))
        }
        if (nodeId && nodeId > 0) {
          void apiClient.post(`/library/nodes/${nodeId}/scan`).catch(() => {})
        }
      }
    } catch (err: any) {
      setExecutionError(err?.message || 'An unexpected error occurred while executing organization.')
    } finally {
      setExecuting(false)
      setProgress(null)
    }
  }, [nodeId, actionableItems, selectedFolder, fetchRealPreview, deleteEmptyFolders, queryClient, setItems])

  return {
    executing,
    executionError,
    setExecutionError,
    executedCount,
    setExecutedCount,
    progress,
    handleExecute,
    handleStopExecute,
  }
}
