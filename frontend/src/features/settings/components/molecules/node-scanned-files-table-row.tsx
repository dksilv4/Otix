import { useState } from 'react'
import {
  Gamepad2,
  Disc,
  Copy,
  Check,
  Sparkles,
  ChevronRight,
  CornerDownRight,
  FileCode,
  AlertTriangle,
  Layers,
  Unlink,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { getDesktopAPI } from '@/lib/desktop/api'
import type { ScannedGameItem, ScannedGameSource } from '../../utils/scanned-summary'
import {
  type NodeScanColumnId,
  DEFAULT_VISIBLE_COLUMNS,
  getFileFormatBadge,
  formatScanSize,
  formatScanDate,
  splitPathForDisplay,
  resolvePlatformLabel,
  resolveItemVersion,
  isLikelyUpdateFile,
} from '../../utils/node-scan-files'
import { useNodeRowTheme } from '../../hooks/use-node-row-theme'
import { cn } from '@/lib/utils'

export interface NodeScannedFilesTableRowProps {
  item: ScannedGameItem
  isExpanded: boolean
  onToggleExpand: (id: string | number) => void
  onOpenMatchModal: (game: ScannedGameItem) => void
  onOpenDetails: (game: ScannedGameItem) => void
  onUnlinkSource?: (primaryId: string | number, sourceId: string | number) => void
  visibleColumns?: Record<NodeScanColumnId, boolean>
}

export const NodeScannedFilesTableRow = ({
  item,
  isExpanded,
  onToggleExpand,
  onOpenMatchModal,
  onOpenDetails,
  onUnlinkSource,
  visibleColumns = DEFAULT_VISIBLE_COLUMNS,
}: NodeScannedFilesTableRowProps) => {
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const theme = useNodeRowTheme(item)

  const handleCopyPath = (path: string) => {
    void navigator.clipboard.writeText(path)
    setCopiedPath(path)
    setTimeout(() => {
      setCopiedPath(null)
    }, 2000)
  }

  const badge = getFileFormatBadge(item)
  const isCopied = copiedPath === item.path
  const { filename } = splitPathForDisplay(item.path)
  const platformLabel = resolvePlatformLabel(item)
  const version = resolveItemVersion(item)
  const hasUpdates = Boolean(item.updates && item.updates.length > 0)
  const secondarySources = (item.sources || []).filter((s) => s.id !== item.id)
  const hasMultipleSources = Boolean(item.isMultiSource && secondarySources.length > 0)
  const suspectedUpdate = !item.isUpdate && isLikelyUpdateFile(item)
  const effectiveBackdrop = item.backdropUrl || item.posterUrl || theme?.backdropUrl || null
  const hasImage = Boolean(item.matched && effectiveBackdrop)
  const cellBg = hasImage
    ? 'bg-transparent group-hover:bg-white/[0.04]'
    : 'bg-[var(--dk-surface-ghost)]/60 group-hover:bg-[var(--dk-surface-ghost)]/90'

  // Artwork icon hydration: prefer iconUrl, fallback to logoUrl or posterUrl
  const effectiveIcon = item.iconUrl || item.logoUrl || item.posterUrl || null

  return (
    <>
      {/* ── Main Game Row (Floating Card) ── */}
      <tr
        onClick={() => onOpenDetails(item)}
        className="group relative transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer"
        style={theme && !hasImage ? theme.rowStyle : undefined}
      >
        {/* Icon Column (First cell: rounded-l-2xl, border-l) */}
        {visibleColumns.icon && (
          <td
            className={cn(
              'py-2.5 px-3 text-center border-y border-white/[0.04] first:border-l first:border-white/[0.04] first:rounded-l-2xl transition-all',
              cellBg,
              item.matched && 'first:border-l-2',
            )}
            style={{
              borderLeftColor: item.matched ? theme?.accentColor : undefined,
            }}
          >
            {/* Row background image with brightness filter (no heavy gradient overlay) */}
            {hasImage && effectiveBackdrop && (
              <div
                className="absolute inset-0 -z-10 overflow-hidden rounded-2xl pointer-events-none select-none"
                aria-hidden="true"
              >
                <img
                  src={effectiveBackdrop}
                  alt=""
                  className="w-full h-full object-cover filter brightness-[0.35] group-hover:brightness-[0.45] transition-all duration-300"
                  style={{ objectPosition: 'center 30%' }}
                  loading="lazy"
                />
              </div>
            )}
            <div className="flex items-center justify-center">
              {effectiveIcon ? (
                <img
                  src={effectiveIcon}
                  alt=""
                  className="h-6 w-6 rounded-md object-contain bg-[var(--dk-surface-base)] transition-shadow"
                  style={
                    theme
                      ? {
                          boxShadow: `0 0 10px ${theme.accentGlow}`,
                          borderColor: theme.borderGlow,
                        }
                      : undefined
                  }
                  loading="lazy"
                />
              ) : (
                <div
                  className="h-6 w-6 rounded-md bg-[var(--dk-surface-base)] border border-white/[0.04] flex items-center justify-center text-muted-foreground/60 transition-shadow"
                  style={
                    theme
                      ? {
                          boxShadow: `0 0 10px ${theme.accentGlow}`,
                          borderColor: theme.borderGlow,
                        }
                      : undefined
                  }
                >
                  {badge.isIso ? (
                    <Disc className="h-3.5 w-3.5" />
                  ) : (
                    <Gamepad2 className="h-3.5 w-3.5" />
                  )}
                </div>
              )}
            </div>
          </td>
        )}

        {/* Title & Info */}
        <td
          className={cn(
            'py-2.5 px-3 min-w-[170px] max-w-xs sm:max-w-sm border-y border-white/[0.04] transition-all',
            !visibleColumns.icon && 'first:border-l first:border-white/[0.04] first:rounded-l-2xl',
            cellBg,
          )}
        >
          {/* Fallback artwork container when icon column is hidden */}
          {!visibleColumns.icon && hasImage && effectiveBackdrop && (
            <div
              className="absolute inset-0 -z-10 overflow-hidden rounded-2xl pointer-events-none select-none"
              aria-hidden="true"
            >
              <img
                src={effectiveBackdrop}
                alt=""
                className="w-full h-full object-cover filter brightness-[0.35] group-hover:brightness-[0.45] transition-all duration-300"
                style={{ objectPosition: 'center 30%' }}
                loading="lazy"
              />
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            {hasUpdates && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleExpand(item.id)
                }}
                title={isExpanded ? 'Collapse updates' : 'Expand updates'}
                className="p-0.5 -ml-1 rounded hover:bg-white/[0.08] text-muted-foreground hover:text-foreground cursor-pointer transition-colors shrink-0"
              >
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 transition-transform duration-200',
                    isExpanded && 'rotate-90 text-primary',
                  )}
                />
              </button>
            )}

            <span className="font-semibold text-foreground truncate text-xs sm:text-sm">
              {item.title}
            </span>

            {item.releaseYear && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--dk-surface-base)]/80 backdrop-blur-sm text-muted-foreground shrink-0 font-medium">
                {item.releaseYear}
              </span>
            )}

            {/* Inline version badge for compact mobile layout */}
            {version && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 font-medium shrink-0 sm:hidden">
                {version}
              </span>
            )}

            {hasMultipleSources && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleExpand(item.id)
                }}
                className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium hover:bg-primary/20 transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1"
                title={`${item.sources!.length} sources unified: ${item.sources!.map((s) => s.format).join(', ')}`}
              >
                <Layers className="h-2.5 w-2.5" />
                <span>
                  +{secondarySources.length} {item.hasInstalledSource && item.hasIsoSource ? 'Installed + ISO' : 'Sources'}
                </span>
              </button>
            )}

            {hasUpdates && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleExpand(item.id)
                }}
                className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium hover:bg-primary/20 transition-colors cursor-pointer shrink-0"
                title={`${item.updates!.length} updates attached to this game`}
              >
                +{item.updates!.length} {item.updates!.length === 1 ? 'update' : 'updates'}
              </button>
            )}
          </div>

          {/* Mobile filename fallback */}
          <div className="text-[11px] font-mono font-medium text-muted-foreground truncate md:hidden mt-0.5" title={item.path}>
            {filename}
          </div>
        </td>

        {/* File Name Column */}
        {visibleColumns.filename && (
          <td
            className={cn(
              'py-2.5 px-3 hidden md:table-cell max-w-xs lg:max-w-sm border-y border-white/[0.04] transition-all',
              cellBg,
            )}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="font-mono text-[11px] font-semibold text-foreground truncate select-all"
                title={item.path}
              >
                {filename}
              </span>

              {suspectedUpdate && (
                <span
                  className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0"
                  title="File name contains update/patch keywords. Check if this is an update rather than the base game installer."
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  <span>Update?</span>
                </span>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleCopyPath(item.path)
                }}
                title={isCopied ? 'Copied to clipboard' : 'Copy file path'}
                className="p-1 rounded text-muted-foreground/50 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
              >
                {isCopied ? (
                  <Check className="h-3 w-3 text-primary" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          </td>
        )}

        {/* Platform Column */}
        {visibleColumns.platform && (
          <td
            className={cn(
              'py-2.5 px-3 text-center border-y border-white/[0.04] transition-all',
              cellBg,
            )}
          >
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-[var(--dk-surface-base)]/80 backdrop-blur-sm text-foreground/90 border border-white/[0.04]">
              {platformLabel}
            </span>
          </td>
        )}

        {/* Version Column */}
        {visibleColumns.version && (
          <td
            className={cn(
              'py-2.5 px-2 text-center border-y border-white/[0.04] transition-all',
              cellBg,
            )}
          >
            {version ? (
              <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--dk-surface-base)]/80 backdrop-blur-sm text-foreground/90 border border-white/[0.04]">
                {version}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground/40 font-mono select-none">—</span>
            )}
          </td>
        )}

        {/* Format Badge */}
        {visibleColumns.format && (
          <td
            className={cn(
              'py-2.5 px-2 text-center border-y border-white/[0.04] transition-all',
              cellBg,
            )}
          >
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-[var(--dk-surface-base)]/80 backdrop-blur-sm text-muted-foreground border border-white/[0.04]">
              {badge.label}
            </span>
          </td>
        )}

        {/* Size */}
        {visibleColumns.size && (
          <td
            className={cn(
              'py-2.5 px-3 text-right font-mono text-[11px] text-muted-foreground whitespace-nowrap border-y border-white/[0.04] transition-all',
              cellBg,
            )}
          >
            {formatScanSize(item.sizeBytes)}
          </td>
        )}

        {/* Date Column */}
        {visibleColumns.date && (
          <td
            className={cn(
              'py-2.5 px-3 text-center font-mono text-[11px] text-muted-foreground whitespace-nowrap hidden lg:table-cell border-y border-white/[0.04] transition-all',
              cellBg,
            )}
          >
            {formatScanDate(item.modifiedAt)}
          </td>
        )}

        {/* Simplified Status (Tick for matched, line for unmatched) */}
        {visibleColumns.status && (
          <td
            className={cn(
              'py-2.5 px-2 text-center whitespace-nowrap border-y border-white/[0.04] transition-all',
              cellBg,
            )}
          >
            {item.matched ? (
              <div
                className="flex items-center justify-center transition-colors"
                style={{ color: theme?.accentColor }}
                title={
                  item.confidence
                    ? `Matched (${Math.round(item.confidence <= 1 ? item.confidence * 100 : item.confidence)}%)`
                    : 'Matched'
                }
              >
                <Check className="h-4 w-4" strokeWidth={2.5} />
              </div>
            ) : (
              <div className="flex items-center justify-center text-muted-foreground/40" title="Unmatched">
                <span className="font-mono font-bold select-none">—</span>
              </div>
            )}
          </td>
        )}

        {/* Actions (Last cell: rounded-r-2xl, border-r) */}
        <td
          className={cn(
            'py-2.5 px-3 text-right whitespace-nowrap border-y border-white/[0.04] last:border-r last:border-white/[0.04] last:rounded-r-2xl transition-all',
            cellBg,
          )}
        >
          <div className="flex items-center justify-end gap-1.5">
            <DkButton
              type="button"
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                onOpenMatchModal(item)
              }}
              style={theme ? { color: theme.accentColor } : undefined}
              className="h-7 px-2.5 text-[11px] font-medium rounded-lg text-primary hover:bg-primary/10"
            >
              <Sparkles className="h-3 w-3 mr-1" />
              <span>{item.matched ? 'Edit Match' : 'Match'}</span>
            </DkButton>
          </div>
        </td>
      </tr>

      {/* ── Secondary / Sub-Rows for Scanned Updates (Floating Sub-Card) ── */}
      {isExpanded &&
        item.updates?.map((upd) => {
          const updCopy = copiedPath === upd.path
          const { filename: updFilename } = splitPathForDisplay(upd.path)
          const updBadge = getFileFormatBadge(upd)
          const updVersion = resolveItemVersion(upd)

          return (
            <tr
              key={`upd-${String(upd.id)}`}
              onClick={() => onOpenDetails(upd)}
              className="group/upd transition-all duration-150 hover:-translate-y-0.5 cursor-pointer"
            >
              {/* Branch indicator (rounded-l-xl) */}
              {visibleColumns.icon && (
                <td className="py-2 px-3 text-center bg-[var(--dk-surface-ghost)]/30 group-hover/upd:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] first:border-l first:border-white/[0.03] first:rounded-l-xl transition-all">
                  <div className="flex items-center justify-center text-primary/70">
                    <CornerDownRight className="h-3.5 w-3.5" />
                  </div>
                </td>
              )}

              {/* Update Title */}
              <td
                className={cn(
                  'py-2 px-3 bg-[var(--dk-surface-ghost)]/30 group-hover/upd:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] transition-all',
                  !visibleColumns.icon && 'first:border-l first:border-white/[0.03] first:rounded-l-xl',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <FileCode className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="font-medium text-foreground text-xs truncate">
                    {upd.title || updFilename}
                  </span>
                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 font-semibold shrink-0">
                    Update
                  </span>
                </div>
              </td>

              {/* Update File Name */}
              {visibleColumns.filename && (
                <td className="py-2 px-3 hidden md:table-cell max-w-xs lg:max-w-sm bg-[var(--dk-surface-ghost)]/30 group-hover/upd:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] transition-all">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-[11px] font-semibold text-foreground truncate select-all" title={upd.path}>
                      {updFilename}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCopyPath(upd.path)
                      }}
                      title={updCopy ? 'Copied' : 'Copy update path'}
                      className="p-1 rounded text-muted-foreground/40 hover:text-foreground opacity-0 group-hover/upd:opacity-100 transition-opacity cursor-pointer shrink-0"
                    >
                      {updCopy ? (
                        <Check className="h-3 w-3 text-primary" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </td>
              )}

              {/* Platform */}
              {visibleColumns.platform && (
                <td className="py-2 px-3 text-center bg-[var(--dk-surface-ghost)]/30 group-hover/upd:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] transition-all">
                  <span className="text-[9px] uppercase font-semibold text-muted-foreground px-1.5 py-0.5 rounded bg-[var(--dk-surface-base)] border border-white/[0.04]">
                    Patch
                  </span>
                </td>
              )}

              {/* Version */}
              {visibleColumns.version && (
                <td className="py-2 px-2 text-center bg-[var(--dk-surface-ghost)]/30 group-hover/upd:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] transition-all">
                  {updVersion ? (
                    <span className="font-mono text-[9px] font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
                      {updVersion}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/40 font-mono select-none">—</span>
                  )}
                </td>
              )}

              {/* Format */}
              {visibleColumns.format && (
                <td className="py-2 px-2 text-center bg-[var(--dk-surface-ghost)]/30 group-hover/upd:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] transition-all">
                  <span className="text-[9px] uppercase font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
                    {updBadge.label}
                  </span>
                </td>
              )}

              {/* Size */}
              {visibleColumns.size && (
                <td className="py-2 px-3 text-right font-mono text-[11px] text-muted-foreground whitespace-nowrap bg-[var(--dk-surface-ghost)]/30 group-hover/upd:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] transition-all">
                  {formatScanSize(upd.sizeBytes)}
                </td>
              )}

              {/* Date */}
              {visibleColumns.date && (
                <td className="py-2 px-3 text-center font-mono text-[11px] text-muted-foreground whitespace-nowrap hidden lg:table-cell bg-[var(--dk-surface-ghost)]/30 group-hover/upd:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] transition-all">
                  {formatScanDate(upd.modifiedAt)}
                </td>
              )}

              {/* Status */}
              {visibleColumns.status && (
                <td className="py-2 px-2 text-center bg-[var(--dk-surface-ghost)]/30 group-hover/upd:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] transition-all">
                  <span className="text-[10px] text-muted-foreground/50 select-none">•</span>
                </td>
              )}

              {/* Actions (rounded-r-xl) */}
              <td className="py-2 px-3 text-right whitespace-nowrap bg-[var(--dk-surface-ghost)]/30 group-hover/upd:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] last:border-r last:border-white/[0.03] last:rounded-r-xl transition-all">
                <span className="text-[10px] text-muted-foreground/60 italic">Linked Update</span>
              </td>
            </tr>
          )
        })}

      {/* ── Expanded Secondary Sources Rows (e.g. ISO Image / Backup / Alternate Copy) ── */}
      {isExpanded &&
        secondarySources.map((source) => {
          const { filename: srcFilename } = splitPathForDisplay(source.path)
          const srcCopy = copiedPath === source.path
          const isIsoSrc = Boolean(source.isIso || source.format?.toUpperCase() === 'ISO')

          return (
            <tr
              key={`src-${source.id}`}
              className="group/src relative transition-all duration-150 hover:bg-white/[0.02]"
            >
              {/* Indent Indicator */}
              {visibleColumns.icon && (
                <td className="py-2 px-3 text-center bg-[var(--dk-surface-ghost)]/30 group-hover/src:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] first:border-l first:border-white/[0.03] first:rounded-l-xl transition-all">
                  <div className="flex items-center justify-center text-muted-foreground/50">
                    <CornerDownRight className="h-3.5 w-3.5" />
                  </div>
                </td>
              )}

              {/* Source Title & Type Label */}
              <td
                className={cn(
                  'py-2 px-3 bg-[var(--dk-surface-ghost)]/30 group-hover/src:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] transition-all',
                  !visibleColumns.icon && 'first:border-l first:border-white/[0.03] first:rounded-l-xl',
                )}
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  {isIsoSrc ? (
                    <Disc className="h-3.5 w-3.5 text-primary shrink-0" />
                  ) : (
                    <Gamepad2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                  <span className="font-medium text-foreground text-xs truncate max-w-[140px] sm:max-w-none">
                    {source.title || srcFilename}
                  </span>
                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 font-semibold shrink-0">
                    {isIsoSrc ? 'Source ISO' : 'Installed Copy'}
                  </span>
                </div>
              </td>

              {/* Source File Name & Copy */}
              {visibleColumns.filename && (
                <td className="py-2 px-3 hidden md:table-cell max-w-xs lg:max-w-sm bg-[var(--dk-surface-ghost)]/30 group-hover/src:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] transition-all">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-[11px] font-semibold text-foreground truncate select-all" title={source.path}>
                      {srcFilename}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCopyPath(source.path)
                      }}
                      title={srcCopy ? 'Copied' : 'Copy file path'}
                      className="p-1 rounded text-muted-foreground/40 hover:text-foreground opacity-0 group-hover/src:opacity-100 transition-opacity cursor-pointer shrink-0"
                    >
                      {srcCopy ? (
                        <Check className="h-3 w-3 text-primary" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </td>
              )}

              {/* Platform */}
              {visibleColumns.platform && (
                <td className="py-2 px-3 text-center bg-[var(--dk-surface-ghost)]/30 group-hover/src:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] transition-all">
                  <span className="text-[9px] uppercase font-semibold text-muted-foreground px-1.5 py-0.5 rounded bg-[var(--dk-surface-base)] border border-white/[0.04]">
                    {source.platform ? String(source.platform).toUpperCase() : 'PC'}
                  </span>
                </td>
              )}

              {/* Version */}
              {visibleColumns.version && (
                <td className="py-2 px-2 text-center bg-[var(--dk-surface-ghost)]/30 group-hover/src:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] transition-all">
                  {source.version ? (
                    <span className="font-mono text-[9px] font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
                      {source.version}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/40 font-mono select-none">—</span>
                  )}
                </td>
              )}

              {/* Format */}
              {visibleColumns.format && (
                <td className="py-2 px-2 text-center bg-[var(--dk-surface-ghost)]/30 group-hover/src:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] transition-all">
                  <span className="text-[9px] uppercase font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
                    {source.format || (isIsoSrc ? 'ISO' : 'PC')}
                  </span>
                </td>
              )}

              {/* Size */}
              {visibleColumns.size && (
                <td className="py-2 px-3 text-right font-mono text-[11px] text-muted-foreground whitespace-nowrap bg-[var(--dk-surface-ghost)]/30 group-hover/src:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] transition-all">
                  {formatScanSize(source.sizeBytes)}
                </td>
              )}

              {/* Date */}
              {visibleColumns.date && (
                <td className="py-2 px-3 text-center font-mono text-[11px] text-muted-foreground whitespace-nowrap hidden lg:table-cell bg-[var(--dk-surface-ghost)]/30 group-hover/src:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] transition-all">
                  {formatScanDate(source.modifiedAt)}
                </td>
              )}

              {/* Status */}
              {visibleColumns.status && (
                <td className="py-2 px-2 text-center bg-[var(--dk-surface-ghost)]/30 group-hover/src:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] transition-all">
                  <span className="text-[10px] text-muted-foreground/50 select-none">•</span>
                </td>
              )}

              {/* Actions (rounded-r-xl) */}
              <td className="py-2 px-3 text-right whitespace-nowrap bg-[var(--dk-surface-ghost)]/30 group-hover/src:bg-[var(--dk-surface-ghost)]/60 border-y border-white/[0.03] last:border-r last:border-white/[0.03] last:rounded-r-xl transition-all">
                <div className="flex items-center justify-end gap-1.5">
                  {isIsoSrc && (
                    <DkButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={async (e) => {
                        e.stopPropagation()
                        const api = getDesktopAPI()
                        if (api?.mountIso) {
                          try {
                            await api.mountIso(source.path)
                          } catch (mountErr) {
                            console.error('Failed to mount ISO:', mountErr)
                          }
                        }
                      }}
                      title="Mount ISO disc image"
                      className="h-6 px-2 text-[10px] rounded-lg cursor-pointer"
                    >
                      <Disc className="h-3 w-3 mr-1 text-primary" />
                      <span>Mount</span>
                    </DkButton>
                  )}

                  {onUnlinkSource && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onUnlinkSource(item.id, source.id)
                      }}
                      title="Unlink source to display as independent row"
                      className="p-1 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.06] transition-colors cursor-pointer"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )
        })}
    </>
  )
}
