import React from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProwlarrIndexerItem } from '../usenet-types'
import { filterIndexersByProtocol } from '../usenet-utils'

import { protocolChip } from '../utils'

export const ProwlarrIndexersPanel = ({
  protocol,
  onProtocolChange,
  onSync,
  isSyncing,
  indexers,
  syncMessage,
}: {
  protocol: 'all' | 'torrent' | 'usenet'
  onProtocolChange: (protocol: 'all' | 'torrent' | 'usenet') => void
  onSync: () => void
  isSyncing?: boolean
  indexers: ProwlarrIndexerItem[]
  syncMessage?: string | null
}) => {
  const visible = filterIndexersByProtocol(indexers, protocol)
  const count = visible.length

  return (
    <div className="space-y-3">
      <div className="relative flex min-h-8 items-center justify-center">
        <div className="absolute inset-y-0 left-0 z-10 flex items-center">
          <div
            role="group"
            aria-label="Protocol"
            className="inline-flex items-center gap-0.5 rounded-xl p-1"
            style={{ backgroundColor: 'var(--dk-surface-glass)' }}
          >
            {(['all', 'torrent', 'usenet'] as const).map((proto) => (
              <button
                key={proto}
                type="button"
                onClick={() => onProtocolChange(proto)}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-xs font-medium capitalize transition-colors cursor-pointer',
                  protocol === proto
                    ? 'bg-white/20 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white'
                )}
              >
                {proto}
              </button>
            ))}
          </div>
        </div>
        <h3 className="text-center text-sm font-medium text-white/60">Indexers</h3>
        <div className="absolute inset-y-0 right-0 z-10 flex items-center">
          <button
            type="button"
            onClick={onSync}
            disabled={isSyncing}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-rose-500 px-3 text-xs font-bold text-white transition-colors hover:bg-rose-400 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
            {isSyncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      <div
        role="list"
        aria-label={
          count > 0
            ? `Indexer list, ${count} ${count === 1 ? 'indexer' : 'indexers'}`
            : 'Indexer list'
        }
        className="max-h-52 overflow-y-auto rounded-2xl py-1"
        style={{ backgroundColor: 'var(--dk-surface-glass)' }}
      >
        {count === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-sm font-medium text-white/70">No indexers yet</p>
            <p className="mt-1 text-xs text-white/45">Press Sync to pull indexers from Prowlarr.</p>
          </div>
        ) : (
          visible.map((idx, i) => {
            const chip = protocolChip(idx.protocol)
            return (
              <div
                key={idx.id}
                role="listitem"
                className={cn(
                  'flex items-center justify-between gap-3 px-4 py-2.5',
                  i % 2 === 1 && 'bg-white/[0.03]',
                  'hover:bg-white/[0.06]'
                )}
              >
                <span className="min-w-0 truncate text-sm font-medium text-white/85">{idx.name}</span>
                <span
                  className={cn(
                    'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                    chip.className
                  )}
                >
                  {chip.label}
                </span>
              </div>
            )
          })
        )}
      </div>

      {syncMessage ? (
        <p className="text-xs text-white/50">{syncMessage}</p>
      ) : null}
    </div>
  )
};
