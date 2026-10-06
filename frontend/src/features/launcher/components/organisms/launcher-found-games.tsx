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
        <HardDrive size={14} className="text-white/35 shrink-0" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-white/70">
          Found on servers
        </h3>
        <span className="text-[10px] font-semibold text-white/35 tabular-nums">
          {found.length}
        </span>
        {unmatchedCount > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300/90">
            {unmatchedCount} unmatched
          </span>
        )}
        <ChevronDown
          size={14}
          className={`ml-auto text-white/30 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
            <div className="flex items-center gap-1">
              {(['unmatched', 'all'] as FoundTab[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
                    tab === id
                      ? 'bg-white/12 text-white'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {id === 'unmatched' ? `Unmatched (${unmatchedCount})` : `All (${found.length})`}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-0">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search found games…"
                className="w-full bg-white/[0.04] rounded-lg pl-7 pr-2 py-1.5 text-[11px] text-white placeholder-white/25 outline-none border-none"
              />
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-[11px] text-white/35">
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
    <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.04] last:border-b-0">
      <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
        <Gamepad2 size={14} className="text-white/35" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-white truncate">{item.game.title}</p>
        <p className="text-[10px] text-white/40 truncate">
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
          className="shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-white cursor-pointer bg-blue-500 hover:bg-blue-400 active:scale-95 transition-all"
        >
          Match
        </button>
      ) : (
        <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-bold uppercase tracking-wider text-emerald-300/90">
          <Check size={12} />
          In library
        </span>
      )}
    </div>
  )
};
