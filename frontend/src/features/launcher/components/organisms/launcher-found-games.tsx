import { useMemo, useState } from 'react'
import { Check, ChevronDown, Gamepad2, HardDrive, Search } from 'lucide-react'
import { getDesktopAPI } from '@/lib/desktop/api'
import { useModal } from '@/lib/modals'
import { formatBytes } from '@/lib/utils/utils'
import { MatchGameModal } from '@/features/launcher/components/molecules/launcher-match-game-modal'
import { useLauncherFoundGames } from '@/features/launcher/data/game-queries'
import type { FoundServerGame } from '@/features/launcher/data/visible-games'
import type { LocalGame } from '@/features/launcher/types'

type FoundTab = 'unmatched' | 'all'

interface Props {
  className?: string
  compact?: boolean
}

export const LauncherFoundGames = ({ className, compact = false }: Props) => {
  const { data: found = [], persistable, isLoading } = useLauncherFoundGames()
  const { openModal } = useModal()
  const unmatchedCount = found.filter((item) => item.status === 'unmatched').length
  const [open, setOpen] = useState(!compact)
  const [tab, setTab] = useState<FoundTab>('all')
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return found.filter((item) => {
      if (tab === 'unmatched' && item.status !== 'unmatched') return false
      if (!q) return true
      return (
        item.game.title.toLowerCase().includes(q)
        || item.filename.toLowerCase().includes(q)
        || item.serverName.toLowerCase().includes(q)
      )
    })
  }, [found, query, tab])

  if (isLoading || found.length === 0) return null

  const persistThenMatch = async (game: LocalGame) => {
    const api = getDesktopAPI()
    if (api?.saveScannedGames && persistable?.length) {
      await api.saveScannedGames(persistable)
    }
    const close = openModal(
      <MatchGameModal game={game} onClose={() => close()} />,
    )
  }

  return (
    <section className={className}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 text-left cursor-pointer"
      >
        <HardDrive size={14} className="text-muted-foreground shrink-0" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
          Found on servers
        </h3>
        <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
          {found.length}
        </span>
        {unmatchedCount > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            {unmatchedCount} unmatched
          </span>
        )}
        <ChevronDown
          size={14}
          className={`ml-auto text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-3 rounded-2xl border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--dk-separator)]">
            <div className="flex items-center gap-1">
              {(['unmatched', 'all'] as FoundTab[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                    tab === id
                      ? 'bg-[var(--dk-surface-field)] text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {id === 'unmatched' ? `Unmatched (${unmatchedCount})` : `All (${found.length})`}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-0">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search found games…"
                className="w-full bg-[var(--dk-surface-field)] rounded-lg pl-7 pr-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground outline-none border-none"
              />
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-[11px] text-muted-foreground">
                {tab === 'unmatched' ? 'Every scanned title is already in your library.' : 'No matching files.'}
              </p>
            ) : (
              rows.map((item) => (
                <FoundGameRow
                  key={item.game.id}
                  item={item}
                  onMatch={() => void persistThenMatch(item.game)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </section>
  )
};

const FoundGameRow = ({
  item,
  onMatch,
}: {
  item: FoundServerGame
  onMatch: () => void
}) => {
  const unmatched = item.status === 'unmatched'
  const extras = item.extraCount > 0
    ? ` · ${item.extraCount} extra file${item.extraCount === 1 ? '' : 's'}`
    : ''

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--dk-separator)] last:border-b-0">
      <div className="w-8 h-8 rounded-lg bg-[var(--dk-surface-field)] flex items-center justify-center shrink-0">
        <Gamepad2 size={14} className="text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground truncate">{item.game.title}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {item.filename}
          {item.filesize ? ` · ${formatBytes(item.filesize)}` : ''}
          {item.serverName ? ` · ${item.serverName}` : ''}
          {extras}
        </p>
      </div>
      {unmatched ? (
        <button
          type="button"
          onClick={onMatch}
          className="shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-primary-foreground cursor-pointer bg-primary hover:bg-primary/90 active:scale-95 transition-all"
        >
          Match
        </button>
      ) : (
        <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          <Check size={12} />
          In library
        </span>
      )}
    </div>
  )
};
