import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  FolderPlus,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { apiClient } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { TokenizedTemplateDisplay } from '../molecules/tokenized-template-display'
import {
  SAMPLE_RELEASES,
  formatTemplateSample,
  TOKEN_COLOR_MAP,
} from '../../utils/naming-template'

export interface PreviewItem {
  sourcePath: string
  sourceFilename: string
  type: string
  matched: boolean
  extracted: Record<string, string>
  targetPath: string
  foldersToCreate: string[]
  status: 'rename_and_move' | 'already_organized' | 'conflict' | 'sample'
}

export interface OrganizeTestRunModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeId?: number | null
  template: string
  isoDirectory: string
}

export const OrganizeTestRunModal = ({
  open,
  onOpenChange,
  nodeId,
  template,
  isoDirectory,
}: OrganizeTestRunModalProps) => {
  const [useSamples, setUseSamples] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<PreviewItem[]>([])

  // Generate synthetic sample previews client-side when in sample mode
  const sampleItems: PreviewItem[] = useMemo(() => {
    const base = isoDirectory.trim() || 'D:\\Games\\ISOs'
    const cleanBase = base.replace(/[\\/]+$/, '')
    const sep = cleanBase.includes('/') ? '/' : '\\'

    return SAMPLE_RELEASES.map((sample) => {
      const formatted = formatTemplateSample(template, sample)
      const targetPath = `${cleanBase}${sep}${formatted.replace(/[\\/]+/g, sep)}`
      const sourcePath = `${cleanBase}${sep}Downloads${sep}${sample.originalName}.${sample.ext}`

      // Calculate folders to create
      const parts = formatted.split(/[\\/]/)
      const folderParts = parts.slice(0, -1)
      const foldersToCreate = folderParts.length > 0 ? [folderParts.join(sep)] : []

      return {
        sourcePath,
        sourceFilename: `${sample.originalName}.${sample.ext}`,
        type: 'iso',
        matched: true,
        extracted: {
          Title: sample.title,
          Year: sample.year,
          Platform: sample.platform,
          ReleaseGroup: sample.group,
          Edition: sample.edition,
          Version: sample.version,
        },
        targetPath,
        foldersToCreate,
        status: 'sample',
      }
    })
  }, [isoDirectory, template])

  const fetchRealPreview = useCallback(async () => {
    if (!open) return
    setLoading(true)

    try {
      if (nodeId && nodeId > 0) {
        // Fetch preview from remote node or backend proxy
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
          // If no files found on disk, default to sample view for clarity
          setItems([])
          setUseSamples(true)
        }
      } else {
        // Fallback for local desktop or unconfigured server
        setItems([])
        setUseSamples(true)
      }
    } catch {
      // Benign fallback to sample preview if node has no files or offline
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

  const metrics = useMemo(() => {
    const total = activeList.length
    const matched = activeList.filter((i) => i.matched).length
    const folderSet = new Set<string>()
    activeList.forEach((i) => {
      i.foldersToCreate?.forEach((f) => folderSet.add(f))
    })
    return {
      total,
      matched,
      foldersCount: folderSet.size,
    }
  }, [activeList])

  if (!open) return null

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Organize Test Run"
      description="Preview how your folder structure template transforms paths before making any changes."
      className="max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
    >
      <div className="flex flex-col flex-1 min-h-0 space-y-4">
        {/* Header & Template Review Bar */}
        <div className="p-3.5 rounded-2xl bg-white/[0.03] space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
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
                onClick={fetchRealPreview}
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
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-white/[0.02] text-center">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Files Scanned</p>
            <p className="text-lg font-bold text-white mt-0.5">{metrics.total}</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-center">
            <p className="text-[10px] font-semibold text-emerald-400/70 uppercase tracking-wider">Matches</p>
            <p className="text-lg font-bold text-emerald-400 mt-0.5">{metrics.matched}</p>
          </div>
          <div className="p-3 rounded-xl bg-cyan-500/10 text-center">
            <p className="text-[10px] font-semibold text-cyan-400/70 uppercase tracking-wider">New Folders</p>
            <p className="text-lg font-bold text-cyan-400 mt-0.5">+{metrics.foldersCount}</p>
          </div>
        </div>

        {/* Path Comparison Cards List */}
        <div className="flex-1 overflow-y-auto max-h-[calc(90vh-310px)] space-y-3 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-white/50 gap-2">
              <Loader2 size={16} className="animate-spin text-primary" />
              <span className="text-xs">Scanning directory and computing target paths...</span>
            </div>
          ) : activeList.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white/[0.02] space-y-2">
              <Info size={24} className="mx-auto text-white/30" />
              <p className="text-sm font-semibold text-white/70">No matching files found in this folder</p>
              <p className="text-xs text-white/40 max-w-sm mx-auto">
                No ISO files were detected in the configured directory. You can test your pattern against
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
            activeList.map((item, idx) => (
              <div
                key={`${item.sourceFilename}-${idx}`}
                className="p-4 rounded-2xl bg-white/[0.025] hover:bg-white/[0.04] transition-all space-y-3"
              >
                {/* Source -> Target Comparison */}
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-xs">
                    <span className="text-white/40 font-mono shrink-0 uppercase text-[10px] mt-0.5 w-16">
                      Current:
                    </span>
                    <span className="font-mono text-white/60 break-all text-[11px] leading-relaxed">
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
                    <span className="text-emerald-400 font-mono font-bold shrink-0 uppercase text-[10px] mt-0.5 w-16">
                      Target:
                    </span>
                    <span className="font-mono font-semibold text-emerald-300 break-all text-[11px] leading-relaxed">
                      {item.targetPath}
                    </span>
                  </div>
                </div>

                {/* Extracted Tokens & Folders to Create */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {item.foldersToCreate?.map((folder, fIdx) => (
                    <span
                      key={`f-${fIdx}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-300"
                    >
                      <FolderPlus size={11} />
                      <span>+ {folder}</span>
                    </span>
                  ))}

                  {Object.entries(item.extracted).map(([tokenKey, value]) => {
                    if (!value) return null
                    const def = TOKEN_COLOR_MAP[tokenKey]
                    const colorClass = def?.colorClass ?? 'text-white/70'
                    const bgClass = def?.bgClass ?? 'bg-white/5'

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
            ))
          )}
        </div>

        {/* Safe Read-Only Notice Footer */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-white/50">
            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
            <span>Read-only dry run. No files or folders on disk have been altered.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <DkButton size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Close Test Run
            </DkButton>
          </div>
        </div>
      </div>
    </DkDialog>
  )
};
