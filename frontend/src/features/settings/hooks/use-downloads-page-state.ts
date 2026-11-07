import { useState } from 'react'
import { useModal } from '@/lib/modals'
import { useToast } from '@ui/molecules/toast'
import {
  useGameServers,
  useCreateGameServer,
  useDeleteGameServer,
  usePingGameServer,
  useUpdateGameServer,
  useClaimGameServer,
  useProbeGameServer,
  usePendingGameServers,
  useUnclaimLocalNode,
  type ServerProbeResult,
} from '@/features/downloads/use-server-downloads'
import { pendingNodesToClaim, isNodeOrphaned, type PendingNode } from '@/features/downloads/pending-nodes'
import { useSettingsNode } from '../context/settings-node-context'

export interface UseDownloadsPageStateOptions {
  variant?: 'all' | 'nodes' | 'clients'
}

export const useDownloadsPageState = ({
  variant = 'all',
}: UseDownloadsPageStateOptions = {}) => {
  const { openModal } = useModal()
  const { toast } = useToast()
  const showClients = variant !== 'nodes'
  const showNodes = variant !== 'clients'
  const { data: remoteServers = [] } = useGameServers()
  const { servers: settingsServers } = useSettingsNode()
  const gameServers = showNodes ? settingsServers : remoteServers
  const createServerMutation = useCreateGameServer()
  const deleteServerMutation = useDeleteGameServer()
  const pingServerMutation = usePingGameServer()
  const updateServerMutation = useUpdateGameServer()
  const claimServerMutation = useClaimGameServer()
  const probeServerMutation = useProbeGameServer()
  const unclaimLocalMutation = useUnclaimLocalNode()
  const { data: pendingNodes = [] } = usePendingGameServers({ enabled: showNodes })

  const [showAddServer, setShowAddServer] = useState(false)
  const [connectTab, setConnectTab] = useState<'claim' | 'manual'>('claim')
  const [claimPin, setClaimPin] = useState('')
  const [claimNodeUrl, setClaimNodeUrl] = useState('')
  const [claimServerName, setClaimServerName] = useState('')
  const [claimIsLocal, setClaimIsLocal] = useState(true)
  const [claimingPin, setClaimingPin] = useState(false)
  const [isUnclaimingQuick, setIsUnclaimingQuick] = useState(false)

  const [probeResults, setProbeResults] = useState<Record<number, ServerProbeResult>>({})
  const [probingServerId, setProbingServerId] = useState<number | null>(null)

  const defaultAutoName = `Node ID:${(gameServers?.length || 0) + 1}`

  const [serverName, setServerName] = useState('')
  const [serverUrl, setServerUrl] = useState('')
  const [serverRemoteUrl, setServerRemoteUrl] = useState('')
  const [serverToken, setServerToken] = useState('')
  const [manualIsLocal, setManualIsLocal] = useState(true)
  const [serverSubmitting, setServerSubmitting] = useState(false)

  const [nodeToDelete, setNodeToDelete] = useState<{ id: number; name: string } | null>(null)
  const unclaimedNodes = pendingNodesToClaim(pendingNodes, gameServers)
  const orphanedNodes = pendingNodes.filter((p) => isNodeOrphaned(p, gameServers))

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetUrl = serverUrl.trim() || (manualIsLocal ? 'http://127.0.0.1:8090' : '')
    if (!targetUrl || !serverToken.trim()) return
    const effectiveName = serverName.trim() || defaultAutoName
    setServerSubmitting(true)
    try {
      const server = await createServerMutation.mutateAsync({
        name: effectiveName,
        local_url: targetUrl,
        remote_url: serverRemoteUrl.trim() || undefined,
        auth_token: serverToken.trim() || undefined,
        is_local: manualIsLocal,
      })
      if (server.isOnline) {
        toast({
          title: 'Node connected',
          description: `Successfully linked ${server.name || effectiveName}.`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'Saved, but marked offline',
          description:
            server.connectError ||
            'Otix could not reach this URL from the API. Check that the node is running and ping again.',
          variant: 'error',
        })
      }
      setServerName('')
      setServerUrl('')
      setServerRemoteUrl('')
      setServerToken('')
      setShowAddServer(false)
    } catch (err: any) {
      toast({
        title: 'Failed to connect node',
        description:
          err.response?.data?.error ||
          err.message ||
          'Check URL, token, and network connection.',
        variant: 'error',
      })
    } finally {
      setServerSubmitting(false)
    }
  }

  const handleDeleteServer = async (id: number, name: string) => {
    try {
      await deleteServerMutation.mutateAsync(id)
      toast({
        title: 'Node disconnected',
        description: `Removed ${name} from your nodes.`,
        variant: 'default',
      })
      setNodeToDelete(null)
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'error',
      })
    }
  }

  const handlePingServer = async (id: number) => {
    try {
      const res: any = await pingServerMutation.mutateAsync(id)
      if (res?.online) {
        toast({
          title: 'Node Online',
          description: `Ping: ${res.latency_ms ?? res.latencyMs}ms · ${res.server?.total_files ?? res.server?.totalFiles ?? 0} games indexed.`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'Node Offline',
          description: res?.error || 'Could not reach node.',
          variant: 'error',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Ping Failed',
        description: err.message,
        variant: 'error',
      })
    }
  }

  const handleSetPrimary = async (id: number) => {
    try {
      await Promise.all(
        gameServers
          .filter((server) => Number(server.id) > 0 && !server.localUrl?.startsWith('otix://') && !server.primaryUrl?.startsWith('otix://'))
          .map((server) =>
            updateServerMutation.mutateAsync({
              id: server.id,
              is_active: server.id === id,
            }),
          ),
      )
      toast({
        title: 'Primary node updated',
        description: 'Downloads and browse actions will prefer this node.',
        variant: 'success',
      })
    } catch (err: any) {
      toast({
        title: 'Could not set primary',
        description: err.message || 'Try again.',
        variant: 'error',
      })
    }
  }

  const handleClaimByPin = async (e: React.FormEvent) => {
    e.preventDefault()
    const pin = claimPin.trim().toUpperCase()
    if (!pin) return
    const effectiveName = claimServerName.trim() || defaultAutoName
    const targetUrl = claimNodeUrl.trim() || (claimIsLocal ? 'http://127.0.0.1:8090' : undefined)
    setClaimingPin(true)
    try {
      const server = await claimServerMutation.mutateAsync({
        claim_code: pin,
        node_url: targetUrl,
        server_name: effectiveName,
        is_local: claimIsLocal,
      })
      toast({
        title: 'Node claimed successfully',
        description: `Connected ${server.name || effectiveName} to your Otix account.`,
        variant: 'success',
      })
      setClaimPin('')
      setClaimNodeUrl('')
      setClaimServerName('')
      setShowAddServer(false)
    } catch (err: any) {
      toast({
        title: 'Claim Failed',
        description:
          err.response?.data?.error ||
          err.message ||
          'Invalid or expired claim PIN. Check your node dashboard.',
        variant: 'error',
      })
    } finally {
      setClaimingPin(false)
    }
  }

  const handleClaimQuickNode = async (node: PendingNode) => {
    if (!node.claimCode) return
    const effectiveQuickName =
      node.serverName && node.serverName !== 'Otix Game Server' && node.serverName !== 'Otix Node'
        ? node.serverName
        : defaultAutoName
    try {
      const server = await claimServerMutation.mutateAsync({
        claim_code: node.claimCode,
        node_url: node.localUrl || undefined,
        server_name: effectiveQuickName,
        is_local: true,
      })
      toast({
        title: 'Node claimed',
        description: `Successfully claimed ${server.name}.`,
        variant: 'success',
      })
    } catch (err: any) {
      toast({
        title: 'Claim Failed',
        description: err.response?.data?.error || err.message || 'Failed to claim node.',
        variant: 'error',
      })
    }
  }

  const handleUnclaimQuickNode = async (node: PendingNode) => {
    setIsUnclaimingQuick(true)
    try {
      await unclaimLocalMutation.mutateAsync(node.authToken)
      toast({
        title: 'Node Reset',
        description: `Reset ${node.serverName || 'local node'}. Fresh PIN generated.`,
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Reset Failed',
        description: 'Failed to reset local node.',
        variant: 'error',
      })
    } finally {
      setIsUnclaimingQuick(false)
    }
  }

  const handleProbeServer = async (id: number, name: string) => {
    setProbingServerId(id)
    try {
      const result = await probeServerMutation.mutateAsync(id)
      setProbeResults((prev) => ({ ...prev, [id]: result }))
      const isReachable = Boolean(
        result.remote_accessible ||
        result.remoteAccessible ||
        result.reachable ||
        result.status === 'online',
      )
      if (isReachable) {
        toast({
          title: 'Remote Access Verified',
          description: `${name} is accessible from the internet (${result.latency_ms ?? result.latencyMs}ms).`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'Remote Access Not Reachable',
          description:
            result.message ||
            result.error ||
            result.suggestion ||
            'Could not reach node via WAN IP. Check router port forwarding (8090).',
          variant: 'error',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Probe Failed',
        description: err.response?.data?.error || err.message || 'Failed to probe node reachability.',
        variant: 'error',
      })
    } finally {
      setProbingServerId(null)
    }
  }

  return {
    openModal,
    showClients,
    showNodes,
    gameServers,
    pendingNodes,
    unclaimedNodes,
    orphanedNodes,
    showAddServer,
    setShowAddServer,
    connectTab,
    setConnectTab,
    claimPin,
    setClaimPin,
    claimNodeUrl,
    setClaimNodeUrl,
    claimServerName,
    setClaimServerName,
    claimIsLocal,
    setClaimIsLocal,
    claimingPin,
    isUnclaimingQuick,
    probeResults,
    probingServerId,
    defaultAutoName,
    serverName,
    setServerName,
    serverUrl,
    setServerUrl,
    serverRemoteUrl,
    setServerRemoteUrl,
    serverToken,
    setServerToken,
    manualIsLocal,
    setManualIsLocal,
    serverSubmitting,
    nodeToDelete,
    setNodeToDelete,
    deletePending: deleteServerMutation.isPending,
    handleAddServer,
    handleDeleteServer,
    handlePingServer,
    handleSetPrimary,
    handleClaimByPin,
    handleClaimQuickNode,
    handleUnclaimQuickNode,
    handleProbeServer,
  }
}
