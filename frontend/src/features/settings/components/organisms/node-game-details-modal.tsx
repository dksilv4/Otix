import { useState } from 'react'
import {
  Gamepad2,
  Disc,
  Copy,
  Check,
  Sparkles,
  HardDrive,
  Calendar,
  FileCode,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Server,
  Layers,
  Hash,
  Unlink,
} from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { getDesktopAPI } from '@/lib/desktop/api'
import type { ScannedGameItem } from '../../utils/scanned-summary'
import {
  getFileFormatBadge,
  formatScanSize,
  formatScanDateTime,
  splitPathForDisplay,
  resolvePlatformLabel,
  isLikelyUpdateFile,
  getFileFormatDescription,
  resolveItemVersion,
} from '../../utils/node-scan-files'

export interface NodeGameDetailsModalProps {
  open: boolean
  onClose: () => void
  game: ScannedGameItem | null
  onOpenMatch?: (game: ScannedGameItem) => void
  onUnlinkSource?: (primaryId: string | number, sourceId: string | number) => void
}

export const NodeGameDetailsModal = ({
  open,
  onClose,
  game,
  onOpenMatch,
  onUnlinkSource,
}: NodeGameDetailsModalProps) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const handleCopy = (key: string, text: string) => {
    void navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => {
      setCopiedKey(null)
    }, 2000)
  }

  if (!game) return null

  const badge = getFileFormatBadge(game)
  const exactFilePath = game.exePath || game.path || ''
  const { filename: matchedFilename, dir: matchedFileDir } = splitPathForDisplay(exactFilePath)
  const folderPath = game.installDir || matchedFileDir.replace(/[\\/]+$/, '') || ''
  const platformLabel = resolvePlatformLabel(game)
  const version = resolveItemVersion(game)
  const hasUpdates = Boolean(game.updates && game.updates.length > 0)
  const suspectedUpdate = !game.isUpdate && isLikelyUpdateFile(game)
  const formatDescription = getFileFormatDescription(game)

  return (
    <DkDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
      title={game.title}
      description={`Exact matched scanner file, library storage path, and specifications.`}
      className="max-w-2xl max-h-[88vh] flex flex-col"
    >
      <div className="flex flex-col gap-4 pt-1 min-h-0 flex-1 overflow-y-auto pr-1">
        {/* ── 1. Compact Header Pod (Artwork, Platform, Version, Match) ── */}
        <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
          <div className="relative shrink-0">
            {game.posterUrl || game.iconUrl ? (
              <img
                src={game.posterUrl || game.iconUrl || ''}
                alt={game.title}
                className="h-16 w-12 sm:h-20 sm:w-15 rounded-xl object-cover bg-[var(--dk-surface-base)] border border-white/[0.06] shadow-sm"
                loading="lazy"
              />
            ) : (
              <div className="h-16 w-12 sm:h-20 sm:w-15 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.06] flex items-center justify-center text-muted-foreground/60 shadow-sm">
                {badge.isIso ? (
                  <Disc className="h-6 w-6" />
                ) : (
                  <Gamepad2 className="h-6 w-6" />
                )}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-primary/20 text-primary border border-primary/30">
                {platformLabel}
              </span>

              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-[var(--dk-surface-base)]/80 text-foreground/80 border border-white/[0.06]">
                {badge.label}
              </span>

              {version && (
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/25">
                  {version}
                </span>
              )}

              {game.releaseYear && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[var(--dk-surface-base)]/80 text-muted-foreground border border-white/[0.06]">
                  {game.releaseYear}
                </span>
              )}

              {game.matched ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/25">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>
                    {game.confidence
                      ? `${Math.round(game.confidence <= 1 ? game.confidence * 100 : game.confidence)}% Matched`
                      : 'Matched'}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--dk-surface-base)] text-muted-foreground border border-white/[0.06]">
                  <AlertCircle className="h-3 w-3" />
                  <span>Unmatched</span>
                </span>
              )}
            </div>

            <div className="font-mono text-xs text-muted-foreground truncate select-all">
              {matchedFilename || exactFilePath}
            </div>
          </div>
        </div>

        {/* ── 2. Suspected Update Alert (if applicable) ── */}
        {suspectedUpdate && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-amber-300 block">
                Suspected Game Update
              </span>
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                This file name contains update or patch patterns. If it is an update for a base title, place it in an updates folder to automatically nest it under its parent game.
              </p>
            </div>
          </div>
        )}

        {/* ── 3. Exact Matched File Location ── */}
        <div className="rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <FileCode className="h-3.5 w-3.5 text-primary" />
              <span>Exact Matched Scanner File</span>
            </span>
            <span className="text-[10px] font-mono font-semibold text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
              Matched Executable / ROM
            </span>
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--dk-surface-field)] border border-white/[0.04]">
            <span className="font-mono text-xs text-foreground font-semibold select-all break-all flex-1">
              {exactFilePath}
            </span>
            <button
              type="button"
              onClick={() => handleCopy('exact-file', exactFilePath)}
              className="p-1.5 rounded-lg bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground cursor-pointer transition-colors shrink-0"
              title="Copy exact file path"
            >
              {copiedKey === 'exact-file' ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* ── 4. Storage Folder Location (if distinct) ── */}
        {folderPath && folderPath !== exactFilePath && (
          <div className="rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] p-3.5 space-y-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <FolderOpen className="h-3.5 w-3.5 text-primary" />
              <span>Installation / Storage Folder</span>
            </span>

            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--dk-surface-field)] border border-white/[0.04]">
              <span className="font-mono text-xs text-muted-foreground select-all break-all flex-1">
                {folderPath}
              </span>
              <button
                type="button"
                onClick={() => handleCopy('folder-path', folderPath)}
                className="p-1.5 rounded-lg bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground cursor-pointer transition-colors shrink-0"
                title="Copy folder path"
              >
                {copiedKey === 'folder-path' ? (
                  <Check className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── 5. Technical & Storage Specifications Grid ── */}
        <div className="rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] p-4 space-y-3">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
            Technical Specifications
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* File Size */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5 text-primary" />
                <span>File Size</span>
              </span>
              <div className="font-mono text-xs font-semibold text-foreground">
                {formatScanSize(game.sizeBytes)}
                {game.sizeBytes ? (
                  <span className="text-[10px] text-muted-foreground font-normal ml-1.5">
                    ({game.sizeBytes.toLocaleString()} bytes)
                  </span>
                ) : null}
              </div>
            </div>

            {/* Target Platform */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Gamepad2 className="h-3.5 w-3.5 text-primary" />
                <span>Target Platform</span>
              </span>
              <div className="text-xs font-semibold text-primary">
                {platformLabel}
              </div>
            </div>

            {/* Format & Container */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span>Format Type</span>
              </span>
              <div className="text-xs font-medium text-foreground">
                {formatDescription}
              </div>
            </div>

            {/* Version */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <FileCode className="h-3.5 w-3.5 text-primary" />
                <span>Version</span>
              </span>
              <div className="font-mono text-xs font-semibold text-foreground">
                {version ? (
                  <span className="text-primary font-bold">{version}</span>
                ) : (
                  <span className="text-muted-foreground/50 select-none">—</span>
                )}
              </div>
            </div>

            {/* Modified Date */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span>Last Modified</span>
              </span>
              <div className="font-mono text-xs text-foreground">
                {formatScanDateTime(game.modifiedAt)}
              </div>
            </div>

            {/* Source Node */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-primary" />
                <span>Source Node</span>
              </span>
              <div className="text-xs font-medium text-foreground">
                {game.serverName || 'Local Desktop'}
              </div>
            </div>

            {/* Catalog Media ID */}
            {game.mediaId && (
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5 text-primary" />
                  <span>Catalog Media ID</span>
                </span>
                <div className="font-mono text-xs text-muted-foreground select-all">
                  {String(game.mediaId)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 6. Discovered Sources & Alternate Installers (when multi-source) ── */}
        {game.sources && game.sources.length > 1 && (
          <div className="rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span>Discovered Sources & Installers ({game.sources.length})</span>
              </span>
              <span className="text-[10px] text-primary font-medium px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                Combined: {formatScanSize(game.totalSizeBytes || game.sizeBytes)}
              </span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {game.sources.map((src) => {
                const { filename: srcFilename } = splitPathForDisplay(src.path)
                const isIsoSrc = Boolean(src.isIso || src.format?.toUpperCase() === 'ISO')
                const isPrimary = src.id === game.id

                return (
                  <div
                    key={String(src.id)}
                    className="p-3 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isIsoSrc ? (
                          <Disc className="h-3.5 w-3.5 text-primary shrink-0" />
                        ) : (
                          <Gamepad2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                        <span className="font-semibold text-foreground truncate">
                          {src.title || srcFilename}
                        </span>
                        <span className="text-[9px] uppercase font-semibold text-primary px-1.5 py-0.2 rounded bg-primary/10 border border-primary/20">
                          {isPrimary ? 'Primary Playable' : isIsoSrc ? 'Source ISO' : 'Alternate Copy'}
                        </span>
                        {src.version && (
                          <span className="font-mono text-[9px] font-semibold text-primary px-1.5 py-0.2 rounded bg-primary/10 border border-primary/20">
                            {src.version}
                          </span>
                        )}
                      </div>

                      <div className="font-mono text-[10px] text-muted-foreground truncate select-all" title={src.path}>
                        {src.path}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatScanSize(src.sizeBytes)}
                      </span>

                      {/* Copy Path */}
                      <button
                        type="button"
                        onClick={() => handleCopy(`src-${src.id}`, src.path)}
                        className="p-1.5 rounded-lg bg-[var(--dk-surface-field)] text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        title="Copy file path"
                      >
                        {copiedKey === `src-${src.id}` ? (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>

                      {/* Mount ISO */}
                      {isIsoSrc && (
                        <DkButton
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const api = getDesktopAPI()
                            if (api?.mountIso) {
                              try {
                                await api.mountIso(src.path)
                              } catch (err) {
                                console.error('Failed to mount ISO:', err)
                              }
                            }
                          }}
                          className="h-7 px-2 text-xs rounded-lg cursor-pointer"
                          title="Mount ISO virtual disk image"
                        >
                          <Disc className="h-3 w-3 mr-1 text-primary" />
                          <span>Mount</span>
                        </DkButton>
                      )}

                      {/* Unlink Source */}
                      {!isPrimary && onUnlinkSource && (
                        <button
                          type="button"
                          onClick={() => onUnlinkSource(game.id, src.id)}
                          className="p-1.5 rounded-lg bg-[var(--dk-surface-field)] text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                          title="Unlink and separate into distinct table row"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── 6. Linked Updates & Patches (if present) ── */}
        {hasUpdates && (
          <div className="rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileCode className="h-3.5 w-3.5 text-primary" />
                <span>Linked Updates & Patches ({game.updates!.length})</span>
              </span>
              <span className="text-[10px] text-primary font-medium px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                Nested Updates
              </span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {game.updates!.map((upd) => {
                const { filename: updFilename } = splitPathForDisplay(upd.path)
                const updBadge = getFileFormatBadge(upd)
                const updVer = resolveItemVersion(upd)
                return (
                  <div
                    key={String(upd.id)}
                    className="p-2.5 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground truncate">
                          {upd.title || updFilename}
                        </span>
                        {updVer && (
                          <span className="font-mono text-[9px] font-semibold text-primary px-1.5 py-0.2 rounded bg-primary/10 border border-primary/20">
                            {updVer}
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">
                        {upd.path}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[9px] uppercase font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
                        {updBadge.label}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatScanSize(upd.sizeBytes)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(String(upd.id), upd.path)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        title="Copy update path"
                      >
                        {copiedKey === String(upd.id) ? (
                          <Check className="h-3 w-3 text-primary" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── 7. Action Footer ── */}
      <div className="pt-4 mt-3 border-t border-white/[0.04] flex items-center justify-between gap-3 shrink-0">
        <DkButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => handleCopy('footer-path', exactFilePath)}
          className="text-xs rounded-xl"
        >
          {copiedKey === 'footer-path' ? (
            <span className="flex items-center gap-1.5 text-primary">
              <Check className="h-3.5 w-3.5" />
              <span>Copied File Path</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Copy className="h-3.5 w-3.5" />
              <span>Copy File Path</span>
            </span>
          )}
        </DkButton>

        <div className="flex items-center gap-2">
          {onOpenMatch && (
            <DkButton
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                onOpenMatch(game)
              }}
              className="text-xs rounded-xl"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              <span>{game.matched ? 'Edit Match & Platform' : 'Match Game'}</span>
            </DkButton>
          )}

          <DkButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="text-xs rounded-xl"
          >
            Close
          </DkButton>
        </div>
      </div>
    </DkDialog>
  )
}
