import { useState, useMemo } from 'react'
import {
  Copy,
  ArrowDownToLine,
  Server,
  FolderTree,
  Zap,
  Filter,
  FolderOpen,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkSwitch } from '@ui/atoms/switch'
import { DkDropdown } from '@ui/atoms/dropdown'
import { useToast } from '@ui/molecules/toast'
import { SettingsCard } from '../molecules/settings-card'
import { SectionHeader } from '../molecules/settings-section-header'
import { CopyNodeSettingsModal } from './copy-node-settings-modal'
import {
  buildNodeSwitcherOptions,
  getActiveNodeInfo,
} from '../../utils/node-switcher'
import { importNodeSettings } from '../../utils/replicate-node-settings'
import type { GameServer, DownloadConfig } from '@/features/downloads/types'
import { cn } from '@/lib/utils'

export interface CopyImportNodeSettingsCardProps {
  currentNodeId: number
  servers: GameServer[]
  dlConfig?: DownloadConfig | null
  saveConfig?: (cfg: any) => Promise<any>
  onSettingsImported?: () => void
  className?: string
}

export const CopyImportNodeSettingsCard = ({
  currentNodeId,
  servers,
  dlConfig,
  saveConfig,
  onSettingsImported,
  className,
}: CopyImportNodeSettingsCardProps) => {
  const { toast } = useToast()

  const [copyModalOpen, setCopyModalOpen] = useState(false)
  const [copyNaming, setCopyNaming] = useState(true)
  const [copyAutomation, setCopyAutomation] = useState(true)
  const [copyFilters, setCopyFilters] = useState(true)
  const [copyPaths, setCopyPaths] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  // Current active node info
  const activeNode = useMemo(() => {
    return getActiveNodeInfo(currentNodeId, servers)
  }, [currentNodeId, servers])

  // Filter out current active node from import source options
  const sourceOptions = useMemo(() => {
    const all = buildNodeSwitcherOptions(servers)
    return all.filter((opt) => opt.value !== String(currentNodeId))
  }, [servers, currentNodeId])

  const [selectedSourceId, setSelectedSourceId] = useState<string>(() => {
    return sourceOptions[0]?.value || ''
  })

  // Ensure selected source is valid if options change
  const effectiveSourceId = sourceOptions.some((o) => o.value === selectedSourceId)
    ? selectedSourceId
    : sourceOptions[0]?.value || ''

  const handleImport = async () => {
    if (!effectiveSourceId) {
      toast({
        title: 'No source node selected',
        description: 'Please select a node to import settings from.',
        variant: 'error',
      })
      return
    }

    if (!copyNaming && !copyAutomation && !copyFilters && !copyPaths) {
      toast({
        title: 'No settings selected',
        description: 'Please select at least one category to import.',
        variant: 'error',
      })
      return
    }

    const sourceIdNum = Number(effectiveSourceId)
    const sourceNodeInfo = getActiveNodeInfo(sourceIdNum, servers)

    setIsImporting(true)
    try {
      const res = await importNodeSettings({
        sourceNodeId: sourceIdNum,
        targetNodeId: currentNodeId,
        copyNaming,
        copyAutomation,
        copyFilters,
        copyPaths,
        dlConfig,
        saveConfig,
      })

      if (res.success) {
        toast({
          title: 'Settings Imported',
          description: `Successfully imported settings from ${sourceNodeInfo.name} into ${activeNode.name}.`,
          variant: 'success',
        })
        onSettingsImported?.()
      } else {
        toast({
          title: 'Import Failed',
          description: res.error || 'Could not import settings from node.',
          variant: 'error',
        })
      }
    } catch (err: unknown) {
      toast({
        title: 'Import Failed',
        description: (err as { message?: string })?.message || 'An error occurred during import.',
        variant: 'error',
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <SettingsCard className={cn('space-y-4', className)}>
      <SectionHeader
        title="Copy & Import Node Settings"
        description="Import organize rules, templates, and preferences from another node, or broadcast this node's settings to your network."
        action={
          <DkButton
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCopyModalOpen(true)}
            className="gap-1.5 text-xs bg-[var(--dk-surface-base)] border border-white/[0.04] hover:bg-[var(--dk-surface-ghost-hover)] cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5 text-primary" />
            <span>Copy to Other Nodes...</span>
          </DkButton>
        }
      />

      {/* Target & Source Selector Bar */}
      <div className="p-3.5 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 shadow-xs">
              <Server className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">Import into Active Node</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary truncate max-w-[180px]">
                  {activeNode.name}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                Select a source node to copy organize rules and structure templates into this profile.
              </p>
            </div>
          </div>

          <div className="w-full sm:w-64 shrink-0">
            <DkDropdown
              options={sourceOptions.map((opt) => ({
                value: opt.value,
                label: opt.label,
              }))}
              value={effectiveSourceId}
              onChange={setSelectedSourceId}
              placeholder="Select source node..."
              className="w-full"
            />
          </div>
        </div>

        {/* Options to Copy / Import */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-white/[0.04]">
          {/* 1. Naming & Structure */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04]">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <FolderTree className="h-3.5 w-3.5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">Folder Naming & Rules</p>
                <p className="text-[10px] text-muted-foreground truncate">Templates & directory rules</p>
              </div>
            </div>
            <DkSwitch checked={copyNaming} onCheckedChange={setCopyNaming} />
          </div>

          {/* 2. Automation Preferences */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04]">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">Automation Preferences</p>
                <p className="text-[10px] text-muted-foreground truncate">Auto-organize & scan timers</p>
              </div>
            </div>
            <DkSwitch checked={copyAutomation} onCheckedChange={setCopyAutomation} />
          </div>

          {/* 3. Filters & Repackers */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04]">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <Filter className="h-3.5 w-3.5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">Search & Repacker Filters</p>
                <p className="text-[10px] text-muted-foreground truncate">Preferred groups & exclusions</p>
              </div>
            </div>
            <DkSwitch checked={copyFilters} onCheckedChange={setCopyFilters} />
          </div>

          {/* 4. Monitored Library Paths */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04]">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">Monitored Library Paths</p>
                <p className="text-[10px] text-muted-foreground truncate">Monitored folders & downloads</p>
              </div>
            </div>
            <DkSwitch checked={copyPaths} onCheckedChange={setCopyPaths} />
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-1">
          <DkButton
            type="button"
            size="sm"
            onClick={handleImport}
            disabled={isImporting || !effectiveSourceId}
            loading={isImporting}
            className="h-8 text-xs cursor-pointer px-4 gap-1.5"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            <span>Import into this Node</span>
          </DkButton>
        </div>
      </div>

      {/* Copy to Other Nodes Broadcast Modal */}
      {copyModalOpen && (
        <CopyNodeSettingsModal
          open={copyModalOpen}
          onOpenChange={setCopyModalOpen}
          sourceNodeId={currentNodeId}
          sourceNodeName={activeNode.name}
          servers={servers}
          dlConfig={dlConfig}
          onSuccess={onSettingsImported}
        />
      )}
    </SettingsCard>
  )
}
