import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Loader2, Server } from 'lucide-react'
import { useLocation, useNavigate, useParams } from '@tanstack/react-router'
import { DkButton } from '@ui/atoms/button'
import { DkTabs, DkTabList, DkTab, DkTabPanel } from '@ui/molecules/tabs'
import { NodeDownloaderCard } from '@/features/downloads/molecules/node-downloader-card'
import { ImportNodeInstancesButton } from '@/features/downloads/molecules/import-node-instances-modal'
import { isBackendNode } from '../backend-node'
import { isLocalDesktopNode } from '../local-desktop-node'
import { useSettingsNode } from '../context/settings-node-context'
import {
  NODE_SETTINGS_TABS,
  parseNodeIdParam,
  resolveNodeSettingsTab,
  type NodeSettingsTab,
} from '../node-settings'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsPathsSection } from '../components/organisms/settings-paths-section'
import { SettingsOrganizeSection } from '../components/organisms/settings-organize-section'
import { NodeMachineSettings } from '../components/organisms/node-machine-settings'

export function SettingsNodeDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams({ strict: false }) as { nodeId?: string }
  const nodeId = parseNodeIdParam(params.nodeId)
  const { servers, isLoading, setSelectedNodeId } = useSettingsNode()
  const server = servers.find((item) => item.id === nodeId) ?? null

  useEffect(() => {
    if (server) setSelectedNodeId(server.id)
  }, [server, setSelectedNodeId])

  const [activeTab, setActiveTab] = useState<NodeSettingsTab>(() =>
    resolveNodeSettingsTab(location?.hash || (typeof window !== 'undefined' ? window.location.hash : '')),
  )

  useEffect(() => {
    setActiveTab(resolveNodeSettingsTab(location?.hash || (typeof window !== 'undefined' ? window.location.hash : '')))
  }, [location?.hash])

  const handleTabChange = useCallback(
    (tab: NodeSettingsTab) => {
      setActiveTab(tab)
      if (nodeId == null) return
      const hash = tab === 'paths' ? undefined : tab
      void navigate({
        to: '/settings/nodes/$nodeId',
        params: { nodeId: String(nodeId) },
        hash,
        replace: true,
      })
    },
    [navigate, nodeId],
  )

  const goBack = () => {
    void navigate({ to: '/settings/nodes' })
  }

  if (isLoading && !server) {
    return (
      <div className="flex items-center justify-center py-20 text-white/50 gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span>Loading node...</span>
      </div>
    )
  }

  if (!server) {
    return (
      <div className="space-y-4">
        <SectionHeader
          variant="page"
          icon={Server}
          title="Node not found"
          description="This Otix node is not connected to your account."
        />
        <DkButton size="sm" variant="ghost" onClick={goBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to nodes
        </DkButton>
      </div>
    )
  }

  const local = isLocalDesktopNode(server)
  const backend = isBackendNode(server)
  const description = local
    ? 'Folders, organize, downloaders, and app behavior on this computer.'
    : backend
      ? 'Account defaults stored on the Otix backend. Scanning and local downloaders need a worker.'
      : `Folders, organize, downloaders, and machine settings on ${server.name}.`

  return (
    <div className="space-y-6">
      <SectionHeader
        variant="page"
        icon={Server}
        title={server.name}
        description={description}
        action={
          <DkButton size="sm" variant="ghost" onClick={goBack}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Nodes
          </DkButton>
        }
      />

      <DkTabs
        defaultValue={activeTab}
        value={activeTab}
        onValueChange={(next) => handleTabChange(next as NodeSettingsTab)}
        className="space-y-4"
      >
        <DkTabList className="w-full sm:w-auto flex flex-wrap">
          {NODE_SETTINGS_TABS.map((tab) => (
            <DkTab key={tab.id} value={tab.id} className="flex-1 sm:flex-none">
              {tab.label}
            </DkTab>
          ))}
        </DkTabList>
        {NODE_SETTINGS_TABS.map((tab) => (
          <DkTabPanel key={tab.id} value={tab.id} className="pt-2">
            {tab.id === 'paths' && <SettingsPathsSection nodeId={server.id} />}
            {tab.id === 'organize' && <SettingsOrganizeSection nodeId={server.id} />}
            {tab.id === 'downloaders' && (
              <div className="space-y-4">
                <SectionHeader
                  title="Instances"
                  description="SABnzbd on this node. Import also copies Prowlarr, Radarr, and Sonarr from another node."
                  action={<ImportNodeInstancesButton dest={server} />}
                />
                <NodeDownloaderCard server={server} />
              </div>
            )}
            {tab.id === 'machine' && <NodeMachineSettings server={server} />}
          </DkTabPanel>
        ))}
      </DkTabs>
    </div>
  )
}
