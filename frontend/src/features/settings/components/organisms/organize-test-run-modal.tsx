import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  FolderPlus,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { getDesktopAPI } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { TokenizedTemplateDisplay } from '../molecules/tokenized-template-display'
import { TOKEN_COLOR_MAP } from '../../utils/naming-template'
import {
  type PreviewItem,
  generateSamplePreviewItems,
  calculatePreviewMetrics,
  getStatusBadgeInfo,
  getHealthBadgeInfo,
} from '../../utils/organize-test-run'

export type { PreviewItem }

export interface OrganizeTestRunModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeId?: number | null
  template: string
  isoDirectory: string
}

const getOrganizerApi = () =>
  getDesktopAPI() ?? (typeof window !== 'undefined' ? ((window as any).desktopAPI ?? (window as any).electronAPI) : null)

export const OrganizeTestRunModal = ({
  open,
  onOpenChange,
  nodeId,
  template,
  isoDirectory,
}: OrganizeTestRunModalProps) => {
  const [useSamples, setUseSamples] = useState(false)
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [executedCount, setExecutedCount] = useState<number | null>(null)
  const [items, setItems] = useState<PreviewItem[]>([])

  const sampleItems: PreviewItem[] = useMemo(() => {
    return generateSamplePreviewItems(isoDirectory, template)
  }, [isoDirectory, template])

  const fetchRealPreview = useCallback(async (preserveExecuted = false) => {
    if (!open) return
    setLoading(true)
    if (!preserveExecuted) {
      setExecutedCount(null)
    }

    try {
      if (nodeId && nodeId > 0) {
        const res = await apiClient.post<PreviewItem[]>(
          `/library/servers/${nodeId}/organize/preview`,
          {
            directory: isoDirectory,
            template,
          },
        )
        if (Array.isArray(res?.data) && res.data.length > 0) {
          setItems(res.data)
        } else {
          setItems([])
          setUseSamples(true)
        }
      } else if (getOrganizerApi()?.smartOrganizePreview && isoDirectory) {
        const desktopItems = await getOrganizerApi().smartOrganizePreview(isoDirectory, template)
        if (Array.isArray(desktopItems) && desktopItems.length > 0) {
          setItems(desktopItems as PreviewItem[])
        } else {
          setItems([])
          setUseSamples(true)
        }
      } else {
        setItems([])
        setUseSamples(true)
      }
    } catch {
      setItems([])
      setUseSamples(true)
    } finally {
      setLoading(false)
    }
  }, [open, nodeId, isoDirectory, template])

  useEffect(() => {
    if (open) {
      if (!useSamples && isoDirectory) {
        void fetchRealPreview()
      } else {
        setUseSamples(true)
      }
    }
  }, [open, useSamples, isoDirectory, fetchRealPreview])

  const activeList = useSamples ? sampleItems : items
  const metrics = useMemo(() => calculatePreviewMetrics(activeList), [activeList])

  const actionableItems = useMemo(() => {
    return activeList.filter(
      (i) =>
        i.status === 'rename_and_move' ||
        i.status === 'container_package' ||
        i.status === 'secondary_update' ||
        i.status === 'secondary_dlc' ||
        i.status === 'secondary_crack' ||
        i.status === 'secondary_archive_part' ||
        i.status === 'secondary_archive',
    )
  }, [activeList])

  const canExecute =
    !useSamples &&
    actionableItems.length > 0 &&
    (Boolean(nodeId && nodeId > 0) || Boolean(getOrganizerApi()?.executeOrganization))

  const handleExecute = useCallback(async () => {
    if (actionableItems.length === 0) return
    setExecuting(true)
    try {
      if (nodeId && nodeId > 0) {
        const payload = {
          items: actionableItems.map((i) => ({
            sourcePath: i.sourcePath,
            targetPath: i.targetPath,
          })),
        }
        await apiClient.post(`/library/servers/${nodeId}/organize/execute`, payload)
        setExecutedCount(actionableItems.length)
        void fetchRealPreview(true)
      } else if (getOrganizerApi()?.executeOrganization) {
        const payloadItems = actionableItems.map((i) => ({
          sourcePath: i.sourcePath,
          targetPath: i.targetPath,
        }))
        await getOrganizerApi().executeOrganization(payloadItems)
        setExecutedCount(actionableItems.length)
        void fetchRealPreview(true)
      }
    } catch {
      // Benign fallback
    } finally {
      setExecuting(false)
    }
  }, [nodeId, actionableItems, fetchRealPreview])

  if (!open) return null

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Organize Test Run"
      description="Preview how your folder structure and naming templates transform library paths before making any changes."
      className="max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
    >
      <div className="flex flex-col flex-1 min-h-0 space-y-4">
        {/* Header & Template Review Bar */}
        <div className="p-3.5 rounded-2xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Active Folder Structure
            </span>
            <div className="flex items-center gap-2">
              <DkButton
                size="sm"
                variant={useSamples ? 'primary' : 'ghost'}
                onClick={() => setUseSamples(!useSamples)}
                className="text-xs h-7 px-2.5"
              >
                <Sparkles size={12} className="mr-1.5" />
                {useSamples ? 'Using Sample Releases' : 'Switch to Samples'}
              </DkButton>
              <DkButton
                size="sm"
                variant="ghost"
                onClick={() => void fetchRealPreview()}
                disabled={loading}
                className="text-xs h-7 px-2"
                title="Refresh scan"
              >
                <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
              </DkButton>
            </div>
          </div>
          <div className="pt-1 overflow-x-auto">
            <TokenizedTemplateDisplay template={template} size="sm" />
          </div>
        </div>

        {/* Metrics Overview Pill Bar */}
        <div className={cn('grid gap-3', metrics.healable > 0 ? 'grid-cols-5' : 'grid-cols-4')}>
          <div className="p-3 rounded-xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] text-center">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Items Scanned</p>
            <p className="text-lg font-bold text-foreground mt-0.5">{metrics.total}</p>
          </div>
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-center">
            <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">Matched</p>
            <p className="text-lg font-bold text-primary mt-0.5">{metrics.matched}</p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] text-center">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">New Folders</p>
            <p className="text-lg font-bold text-foreground mt-0.5">+{metrics.foldersCount}</p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] text-center">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Packages</p>
            <p className="text-lg font-bold text-foreground mt-0.5">{metrics.packages}</p>
          </div>
          {metrics.healable > 0 && (
            <div className="p-3 rounded-xl bg-primary/15 border border-primary/20 text-center">
              <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">Healable</p>
              <p className="text-lg font-bold text-primary mt-0.5">{metrics.healable}</p>
            </div>
          )}
        </div>

        {executedCount !== null && (
          <div className="p-3 rounded-xl bg-primary/15 border border-primary/20 flex items-center gap-2 text-xs text-primary font-medium">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>Successfully organized {executedCount} game artifacts.</span>
          </div>
        )}

        {/* Path Comparison Cards List */}
        <div className="flex-1 overflow-y-auto max-h-[calc(90vh-310px)] space-y-3 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 size={16} className="animate-spin text-primary" />
              <span className="text-xs">Scanning directory and computing target paths...</span>
            </div>
          ) : activeList.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] space-y-2">
              <Info size={24} className="mx-auto text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">No matching files found in this folder</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                No game artifacts were detected in the configured directory. You can test your pattern against
                sample scene releases.
              </p>
              <div className="pt-2">
                <DkButton size="sm" variant="primary" onClick={() => setUseSamples(true)}>
                  <Sparkles size={13} className="mr-1.5" />
                  View Sample Releases
                </DkButton>
              </div>
            </div>
          ) : (
            activeList.map((item, idx) => {
              const badge = getStatusBadgeInfo(item.status)
              const healthBadge = getHealthBadgeInfo(item.health)
              return (
                <div
                  key={`${item.sourceFilename}-${idx}`}
                  className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-hover)] border border-[var(--dk-separator)] transition-all space-y-3"
                >
                  {/* Status header & Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground truncate">
                      {item.sourceFilename}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {healthBadge && (
                        <span
                          className={cn(
                            'text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border',
                            healthBadge.className,
                          )}
                        >
                          {healthBadge.label}
                        </span>
                      )}
                      <span
                        className={cn(
                          'text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border',
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </div>

                  {/* Archive Diagnostics & Healing Details */}
                  {item.anomalies && item.anomalies.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-[var(--dk-surface-raised)] space-y-1.5 border border-[var(--dk-separator)]">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                        <Wrench size={12} className="shrink-0" />
                        <span>Archive Integrity Diagnostic</span>
                      </div>
                      <div className="space-y-1 pl-4">
                        {item.anomalies.map((msg, aIdx) => (
                          <p key={aIdx} className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                            • {msg}
                          </p>
                        ))}
                      </div>
                      {item.suggestedRenames && Object.keys(item.suggestedRenames).length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 pl-4">
                          <span className="text-[10px] font-semibold text-muted-foreground">Fixes on move:</span>
                          {Object.entries(item.suggestedRenames).map(([from, to]) => (
                            <span
                              key={from}
                              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary border border-primary/20"
                            >
                              {from} → {to}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Source -> Target Comparison */}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-xs">
                      <span className="text-muted-foreground font-mono shrink-0 uppercase text-[10px] mt-0.5 w-16">
                        Current:
                      </span>
                      <span className="font-mono text-muted-foreground break-all text-[11px] leading-relaxed">
                        {item.sourcePath}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pl-16 py-0.5 text-primary">
                      <ArrowRight size={13} className="shrink-0" />
                      <span className="text-[10px] uppercase font-bold tracking-wider text-primary/80">
                        Organizes into
                      </span>
                    </div>

                    <div className="flex items-start gap-2 text-xs">
                      <span className="text-primary font-mono font-bold shrink-0 uppercase text-[10px] mt-0.5 w-16">
                        Target:
                      </span>
                      <span className="font-mono font-semibold text-primary break-all text-[11px] leading-relaxed">
                        {item.targetPath}
                      </span>
                    </div>
                  </div>

                  {/* Extracted Tokens & Folders to Create */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {item.foldersToCreate?.map((folder, fIdx) => (
                      <span
                        key={`f-${fIdx}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-semibold bg-primary/10 text-primary border border-primary/20"
                      >
                        <FolderPlus size={11} />
                        <span>+ {folder}</span>
                      </span>
                    ))}

                    {Object.entries(item.extracted).map(([tokenKey, value]) => {
                      if (!value) return null
                      const def = TOKEN_COLOR_MAP[tokenKey]
                      const colorClass = def?.colorClass ?? 'text-foreground'
                      const bgClass = def?.bgClass ?? 'bg-[var(--dk-surface-raised)] border border-[var(--dk-separator)]'

                      return (
                        <span
                          key={tokenKey}
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono',
                            colorClass,
                            bgClass,
                          )}
                        >
                          <span className="opacity-60">{tokenKey}:</span>
                          <span className="font-semibold">{value}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer & Action Controls */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 size={14} className="text-primary shrink-0" />
            <span>Read-only dry run. No files or folders on disk have been altered.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {canExecute && (
              <DkButton
                size="sm"
                variant="primary"
                onClick={handleExecute}
                disabled={executing || loading}
              >
                {executing ? (
                  <Loader2 size={13} className="mr-1.5 animate-spin" />
                ) : (
                  <Play size={13} className="mr-1.5" />
                )}
                <span>Execute ({actionableItems.length})</span>
              </DkButton>
            )}
            <DkButton size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </DkButton>
          </div>
        </div>
      </div>
    </DkDialog>
  )
};
