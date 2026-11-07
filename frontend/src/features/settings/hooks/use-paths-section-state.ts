import { useState, useMemo } from 'react'
import { useToast } from '@ui/molecules/toast'
import { useAuth } from '@/lib/providers/auth'
import { useDownloadConfig } from '@/features/downloads/use-downloads'
import { pendingNodesToClaim } from '@/features/downloads/pending-nodes'
import { isDesktop } from '@/lib/desktop/api'
import { useSettingsNode } from '../context/settings-node-context'
import { isLocalDesktopNode, isLocalDesktopNodeId } from '../local-desktop-node'
import { useMatchingProgress } from './use-matching-progress'
import { useGameMatches } from './use-node-paths'
import {
  type PathsViewMode,
  type PathsFilterTab,
  loadStoredPathsViewMode,
  saveStoredPathsViewMode,
  getSuggestedDefaultPaths,
  useClaimGameServer,
} from '../utils/paths'
import { useNodeOtixSettings } from './use-node-otix-settings'
import { useScannedSummaryState } from './use-scanned-summary-state'
import { usePathsManagement } from './use-paths-management'
import { usePathsScan } from './use-paths-scan'

export const usePathsSectionState = ({
  nodeId: nodeIdProp,
  onScanComplete,
  onNavigateToOrganize: onNavigateToOrganizeProp,
}: {
  nodeId?: number | null
  onScanComplete?: () => void
  onNavigateToOrganize?: () => void
}) => {
  const { toast } = useToast()
  let user: any = null
  try {
    const auth = useAuth()
    user = auth?.user
  } catch {
    // Graceful fallback for test environments without AuthProvider
  }

  const { config: dlConfig, saveConfig } = useDownloadConfig(user?.id)
  const { selectedNode, servers, pendingNodes = [], setSelectedNodeId } = useSettingsNode()
  const claimServerMutation = useClaimGameServer()
  const [isClaimingDiscovered, setIsClaimingDiscovered] = useState(false)
  const unclaimedNodes = useMemo(() => pendingNodesToClaim(pendingNodes, servers), [pendingNodes, servers])
  const desktop = isDesktop()
  const nodeId = nodeIdProp !== undefined ? nodeIdProp : (selectedNode?.id ?? null)
  const activeNode = servers?.find((s) => s.id === nodeId) ?? (selectedNode?.id === nodeId ? selectedNode : null)
  const isGlobalProfile = nodeId === 0
  const effectiveServerId =
    nodeIdProp !== undefined && nodeIdProp !== null && nodeIdProp > 0
      ? nodeIdProp
      : activeNode?.id && activeNode.id > 0
        ? activeNode.id
        : selectedNode?.id && selectedNode.id > 0
          ? selectedNode.id
          : null
  const isLocalNode = desktop && ((nodeId != null && isLocalDesktopNodeId(nodeId)) || isLocalDesktopNode(activeNode))
  const remoteNodeId = !desktop ? (isGlobalProfile ? null : effectiveServerId) : (isLocalNode ? null : effectiveServerId)
  const folderTarget = remoteNodeId ? 'server' : desktop ? 'local' : 'server'

  // View & Filter State
  const [viewMode, setViewMode] = useState<PathsViewMode>(() => loadStoredPathsViewMode())
  const [filterTab, setFilterTab] = useState<PathsFilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Add folder form state
  const [isAddingFolder, setIsAddingFolder] = useState(false)
  const [draftPath, setDraftPath] = useState('')
  const [draftRoles, setDraftRoles] = useState<{
    installation: boolean
    download: boolean
    iso: boolean
  }>({
    installation: false,
    download: false,
    iso: false,
  })

  // Synchronize view mode with localStorage
  const handleSetViewMode = (mode: PathsViewMode) => {
    setViewMode(mode)
    saveStoredPathsViewMode(mode)
  }

  const handleNavigateToOrganize = () => {
    if (onNavigateToOrganizeProp) {
      onNavigateToOrganizeProp()
      return
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/settings/organize'
    }
  }

  // Modals
  const [viewGamesModalOpen, setViewGamesModalOpen] = useState(false)
  const [matchCenterOpen, setMatchCenterOpen] = useState(false)

  // Remote Node Otix Settings
  const otixSettings = useNodeOtixSettings(remoteNodeId)

  // References for cross-hook delegation
  let triggerScanRef: (path?: string) => Promise<void> = async () => {}
  let loadSummaryRef: () => Promise<void> = async () => {}

  // Paths management
  const paths = usePathsManagement({
    remoteNodeId,
    effectiveServerId,
    user,
    dlConfig,
    saveConfig,
    searchQuery,
    filterTab,
    loadSummary: () => loadSummaryRef(),
    handleTriggerScan: (p) => triggerScanRef(p),
  })

  // Scanned summary state
  const summaryState = useScannedSummaryState(
    remoteNodeId,
    paths.serverDownloadPath,
    paths.gamesInstallPath,
  )
  loadSummaryRef = summaryState.loadSummary

  // Matching progress & Game matches
  const matching = useMatchingProgress()
  const { data: gameMatches = [] } = useGameMatches(undefined, undefined, remoteNodeId ?? 0)
  const pendingMatchesCount = useMemo(
    () => (Array.isArray(gameMatches) ? gameMatches.filter((m) => m?.matchStatus === 'needs_review' || m?.matchStatus === 'unmatched').length : 0),
    [gameMatches],
  )

  // Scanning engine
  const scan = usePathsScan({
    remoteNodeId,
    scanPaths: paths.scanPaths,
    gamesInstallPath: paths.gamesInstallPath,
    writeOtixAfterScan: otixSettings.writeOtixAfterScan,
    downloadOtixImages: otixSettings.downloadOtixImages,
    matching,
    loadSummary: summaryState.loadSummary,
    setSummary: summaryState.setSummary,
    onScanComplete,
  })
  triggerScanRef = scan.handleTriggerScan

  const isMatching = scan.isSyncingOtix || scan.scanProgress.phase === 'matching' || matching.isMatching
  const suggestedPaths = useMemo(() => getSuggestedDefaultPaths(paths.scanPaths), [paths.scanPaths])

  // One-click Claim Discovered Node
  const handleClaimDiscoveredNode = async (node: any) => {
    if (!node?.claimCode) return
    setIsClaimingDiscovered(true)
    try {
      const claimed = await claimServerMutation.mutateAsync({
        claim_code: node.claimCode,
        node_url: node.localUrl || undefined,
        server_name: node.serverName,
        is_local: true,
      })
      toast({
        title: 'Node Claimed',
        description: `Successfully claimed ${claimed.name}. You can now manage and scan its folders.`,
        variant: 'success',
      })
      if (claimed?.id != null) {
        setSelectedNodeId(claimed.id)
      }
      setIsAddingFolder(true)
    } catch (err: any) {
      toast({
        title: 'Claim Failed',
        description: err?.response?.data?.error || err?.message || 'Could not claim node.',
        variant: 'error',
      })
    } finally {
      setIsClaimingDiscovered(false)
    }
  }

  const handleAddFolderSubmit = async (pathToAdd: string) => {
    await paths.handleAddFolder(pathToAdd, draftRoles)
    setDraftPath('')
    setDraftRoles({ installation: false, download: false, iso: false })
    setIsAddingFolder(false)
  }

  return {
    desktop,
    selectedNode,
    remoteNodeId,
    folderTarget,
    unclaimedNodes,
    isClaimingDiscovered,
    handleClaimDiscoveredNode,
    viewMode,
    handleSetViewMode,
    filterTab,
    setFilterTab,
    searchQuery,
    setSearchQuery,
    isAddingFolder,
    setIsAddingFolder,
    draftPath,
    setDraftPath,
    draftRoles,
    setDraftRoles,
    onToggleDraftRole: (role: 'installation' | 'download' | 'iso') =>
      setDraftRoles((prev) => ({ ...prev, [role]: !prev[role] })),
    handleAddFolderSubmit,
    handleNavigateToOrganize,
    viewGamesModalOpen,
    setViewGamesModalOpen,
    matchCenterOpen,
    setMatchCenterOpen,
    matching,
    isMatching,
    pendingMatchesCount,
    suggestedPaths,
    summaryState,
    otixSettings,
    paths,
    scan,
  }
}
