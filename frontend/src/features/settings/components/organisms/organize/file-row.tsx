import { useMemo } from 'react'
import {
  ArrowRight,
  FolderPlus,
  Folder,
  File,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type PreviewItem,
  getStatusBadgeInfo,
  getHealthBadgeInfo,
  isItemFolder,
  getItemTypeLabel,
  getItemSourceSubdirectory,
  getItemTargetSubdirectory,
  getItemSubdirectories,
  normalizePathSeparators,
} from '../../../utils/organize-test-run'

export interface FileRowProps {
  item: PreviewItem
  rootDir?: string
}

export const FileRow = ({ item, rootDir }: FileRowProps) => {
  const isFolder = isItemFolder(item)
  const badge = getStatusBadgeInfo(item.status)
  const healthBadge = getHealthBadgeInfo(item.health)
  const typeLabel = getItemTypeLabel(item)
  const isOrganized = item.status === 'already_organized'
  const sourceSubdir = getItemSourceSubdirectory(item, rootDir)
  const targetSubdir = getItemTargetSubdirectory(item, rootDir)
  const childSubdirs = getItemSubdirectories(item)

  const targetFilename = useMemo(() => {
    if (!item.targetPath) return item.sourceFilename
    const norm = normalizePathSeparators(item.targetPath)
    const last = norm.split('/').pop()
    return last || item.sourceFilename
  }, [item.targetPath, item.sourceFilename])

  const isRenamed =
    Boolean(targetFilename) &&
    targetFilename.toLowerCase() !== item.sourceFilename.toLowerCase()

  return (
    <div className="py-3 px-3 hover:bg-white/[0.015] transition-colors space-y-2">
      {/* Side-by-side comparison columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 items-start">
        {/* LEFT COLUMN: BEFORE (Current) */}
        <div className="space-y-1.5 min-w-0">
          {/* Header & File Type */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <span>BEFORE (Current)</span>
            </span>
            <span className="text-[9px] font-mono uppercase text-muted-foreground px-1.5 py-0.2 rounded bg-white/[0.04] shrink-0">
              {typeLabel}
            </span>
          </div>

          {/* Directory location (Breadcrumb) */}
          {sourceSubdir ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <Folder size={12} className="text-muted-foreground/70 shrink-0" />
              <span className="text-[10px] text-muted-foreground/70 shrink-0">Subdir:</span>
              <span className="font-mono text-[11px] text-foreground/90 font-medium truncate">
                {sourceSubdir}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 min-w-0">
              <Folder size={12} className="shrink-0" />
              <span className="font-mono text-[11px] truncate">Root Folder</span>
            </div>
          )}

          {/* Current File */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-muted-foreground shrink-0">
              {isFolder ? <Folder size={13} className="text-primary" /> : <File size={13} />}
            </div>
            <span className="font-semibold text-xs text-foreground font-mono truncate" title={item.sourceFilename}>
              {item.sourceFilename}
            </span>
          </div>

          {/* Full Source Path (Detailed secondary line) */}
          <div className="pt-0.5">
            <p className="font-mono text-[10px] text-muted-foreground/70 break-all leading-tight">
              {item.sourcePath}
            </p>
          </div>
        </div>

        {/* RIGHT COLUMN: AFTER (Organized) */}
        <div className="space-y-1.5 min-w-0 md:border-l md:border-white/[0.04] md:pl-4">
          {/* Header & Status Badges */}
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'text-[9px] font-bold uppercase tracking-wider flex items-center gap-1',
                isOrganized ? 'text-muted-foreground' : 'text-primary',
              )}
            >
              <ArrowRight size={10} className="shrink-0" />
              <span>AFTER (Organized)</span>
            </span>

            <div className="flex items-center gap-1 shrink-0">
              {healthBadge && (
                <span
                  className={cn(
                    'text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full border border-white/[0.06]',
                    healthBadge.className,
                  )}
                >
                  {healthBadge.label}
                </span>
              )}
              <span
                className={cn(
                  'text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full border border-white/[0.06]',
                  badge.className,
                )}
              >
                {badge.label}
              </span>
            </div>
          </div>

          {/* Target Directory location (Breadcrumb) */}
          {targetSubdir ? (
            <div className="flex items-center gap-1.5 text-xs min-w-0">
              <Folder
                size={12}
                className={cn(
                  'shrink-0',
                  isOrganized ? 'text-muted-foreground/70' : 'text-primary shrink-0',
                )}
              />
              <span className="text-[10px] text-muted-foreground/70 shrink-0">Subdir:</span>
              <span
                className={cn(
                  'font-mono text-[11px] font-medium truncate',
                  isOrganized ? 'text-foreground/90' : 'text-primary',
                )}
              >
                {targetSubdir}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 min-w-0">
              <Folder size={12} className="shrink-0" />
              <span className="font-mono text-[11px] truncate">Root Folder</span>
            </div>
          )}

          {/* Target File (with rename highlighting if changed) */}
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn('shrink-0', isOrganized ? 'text-muted-foreground' : 'text-primary')}>
              {isFolder ? <Folder size={13} /> : <File size={13} />}
            </div>
            <span
              className={cn(
                'font-semibold text-xs font-mono truncate',
                isOrganized ? 'text-foreground' : isRenamed ? 'text-primary font-bold' : 'text-foreground',
              )}
              title={targetFilename}
            >
              {isRenamed ? targetFilename : `→ ${targetFilename}`}
            </span>
            {isRenamed && (
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-primary/15 text-primary border border-primary/20 shrink-0">
                Renamed
              </span>
            )}
          </div>

          {/* Full Target Path & Explanation */}
          <div className="pt-0.5 space-y-1">
            <p
              className={cn(
                'font-mono text-[10px] break-all leading-tight',
                isOrganized ? 'text-muted-foreground/70' : 'text-primary/90 font-medium',
              )}
            >
              {item.targetPath}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-muted-foreground/80">
              <span>— {isOrganized ? 'Organized into target' : 'Organizes into target location'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Package Subdirectories & Folders to Create (Clean inline strip) */}
      {(childSubdirs.length > 0 || (item.foldersToCreate && item.foldersToCreate.length > 0)) && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/[0.02] text-[9px]">
          {childSubdirs.length > 0 && (
            <div className="inline-flex items-center gap-1 text-muted-foreground">
              <span className="font-bold uppercase tracking-wider">
                Folder Package Subdirectories ({childSubdirs.length}):
              </span>
              {childSubdirs.map((subdir) => (
                <span
                  key={subdir}
                  className="font-mono px-1.5 py-0.2 rounded bg-white/[0.04] text-foreground/80"
                >
                  {subdir}/
                </span>
              ))}
            </div>
          )}
          {item.foldersToCreate &&
            item.foldersToCreate.map((folder, fIdx) => (
              <span
                key={`f-${fIdx}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded font-mono font-medium bg-primary/10 text-primary"
              >
                <FolderPlus size={10} />
                <span>+ {folder}</span>
              </span>
            ))}
        </div>
      )}

      {/* Diagnostics / Anomalies (if any) */}
      {item.anomalies && item.anomalies.length > 0 && (
        <div className="mt-1 p-2 rounded-lg bg-[var(--dk-surface-raised)] border border-primary/20 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Wrench size={12} className="shrink-0" />
            <span>Archive Integrity Diagnostic</span>
          </div>
          <div className="space-y-0.5 pl-3">
            {item.anomalies.map((msg, aIdx) => (
              <p key={aIdx} className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                • {msg}
              </p>
            ))}
          </div>
          {item.suggestedRenames && Object.keys(item.suggestedRenames).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5 pl-3">
              <span className="text-[9px] font-semibold text-muted-foreground">Fixes on move:</span>
              {Object.entries(item.suggestedRenames).map(([from, to]) => (
                <span
                  key={from}
                  className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-primary/10 text-primary border border-primary/20"
                >
                  {from} → {to}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
