import { useState } from 'react'
import {
  Sparkles,
  Calendar,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Download,
  CheckCircle2,
  AlertCircle,
  Filter,
  Layers,
  FileCode,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameChangelog } from '@/features/launcher/hooks/use-game-changelog'
import { IsoInstallerModal } from '@/features/launcher/components/organisms/iso-installer-modal'
import { useModal } from '@/lib/modals'
import { PLATFORM_LABELS } from '@/constants/games'
import type { LocalGame, DisplayGame } from '@/features/launcher/types'

interface LauncherGameChangelogProps {
  game: LocalGame | DisplayGame | null
}

export const LauncherGameChangelog = ({ game }: LauncherGameChangelogProps) => {
  const { data, isLoading } = useGameChangelog(game)
  const { openModal } = useModal()
  const [filterPatchesOnly, setFilterPatchesOnly] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  if (!game) return null

  const raw = ('rawGame' in game && game.rawGame ? game.rawGame : game) as LocalGame
  const changelogs = data?.changelogs || []
  const versionInfo = data?.versionInfo

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleApplyUpdate = (updatePath: string) => {
    const close = openModal(
      <IsoInstallerModal
        onClose={() => close()}
        games={[raw]}
        initialIsoPath={updatePath}
      />
    )
  }

  const filteredChangelogs = filterPatchesOnly
    ? changelogs.filter((c) => c.isPatchNote)
    : changelogs

  const formatDate = (timestamp: number) => {
    try {
      const d = new Date(timestamp * 1000)
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return 'Recent'
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Version & Update Status Header ── */}
      <div className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                {versionInfo?.installedVersion || 'v1.0.0'}
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-[var(--dk-surface-field)] text-muted-foreground border border-[var(--dk-separator)]">
                {PLATFORM_LABELS[raw.platform] || raw.platform}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {versionInfo?.hasLocalUpdate
                ? `${versionInfo.localUpdateFiles.length} local update installer(s) available`
                : 'Current installed release'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {versionInfo?.hasLocalUpdate ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              <AlertCircle size={14} /> Update Available
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 size={14} /> Up to date
            </span>
          )}
        </div>
      </div>

      {/* ── Pending Local Patches / Updates (if any) ── */}
      {versionInfo && versionInfo.hasLocalUpdate && (
        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <Download size={14} /> Detected Update Installers ({versionInfo.localUpdateFiles.length})
          </h4>
          <div className="space-y-2">
            {versionInfo.localUpdateFiles.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate flex items-center gap-1.5">
                    <FileCode size={13} className="text-muted-foreground shrink-0" />
                    {file.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                    {file.kind === 'dlc' ? 'DLC' : file.version ? `Update ${file.version}` : file.path}
                  </p>
                </div>
                {!/^https?:\/\//i.test(file.path) && (
                  <button
                    onClick={() => handleApplyUpdate(file.path)}
                    className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs transition-all cursor-pointer shrink-0 shadow-md"
                  >
                    Apply Patch
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Changelog & Release Notes Feed ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Layers size={13} /> Version History & Release Notes
          </h3>

          <button
            onClick={() => setFilterPatchesOnly((prev) => !prev)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
              filterPatchesOnly
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-[var(--dk-surface-ghost)] text-muted-foreground hover:text-foreground border-[var(--dk-separator)]'
            }`}
          >
            <Filter size={12} />
            <span>Patches only</span>
          </button>
        </div>

        {isLoading && (
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground text-xs gap-2">
            <div className="w-5 h-5 border-2 border-[var(--dk-separator)] border-t-primary rounded-full animate-spin" />
            <span>Fetching patch notes & changelogs...</span>
          </div>
        )}

        {!isLoading && filteredChangelogs.length === 0 && (
          <div className="py-8 px-4 rounded-xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] text-center text-muted-foreground text-xs">
            No specific changelogs found matching this filter.
          </div>
        )}

        {!isLoading && filteredChangelogs.length > 0 && (
          <div className="space-y-3">
            {filteredChangelogs.map((item, index) => {
              const isExpanded = expandedIds.has(item.id) || index === 0

              return (
                <div
                  key={item.id}
                  className="rounded-xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] overflow-hidden transition-colors"
                >
                  {/* Header */}
                  <div
                    onClick={() => toggleExpand(item.id)}
                    className="p-3.5 flex items-start justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.version ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                            {item.version}
                          </span>
                        ) : item.isPatchNote ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25">
                            Update
                          </span>
                        ) : null}

                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Calendar size={11} /> {formatDate(item.date)}
                        </span>

                        {item.feedLabel && (
                          <span className="text-[10px] text-muted-foreground font-medium">
                            • {item.feedLabel}
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-semibold text-foreground leading-snug">
                        {item.title}
                      </h4>
                    </div>

                    <button className="text-muted-foreground hover:text-foreground mt-1 p-1 shrink-0">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>

                  {/* Body Content */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-[var(--dk-separator)]"
                      >
                        <div className="p-3.5 pt-2.5 space-y-3 bg-[var(--dk-surface-field)]/40">
                          <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-line font-normal">
                            {item.content}
                          </p>

                          {item.url && (
                            <div className="flex justify-end pt-1">
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline"
                              >
                                View full announcement <ExternalLink size={11} />
                              </a>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
};
