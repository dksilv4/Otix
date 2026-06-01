import { useState } from 'react';
import { ChevronDown, Zap, HardDrive, Calendar } from 'lucide-react';
import type { NZBResult } from '../types';
import { cn } from '@/lib/utils';

function formatSize(bytes: number): string {
  if (bytes > 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  if (bytes > 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

interface NzDownloadSelectorProps {
  results: NZBResult[];
  bestPick: NZBResult | null;
  selected: NZBResult | null;
  onSelect: (result: NZBResult) => void;
}

export function NzDownloadSelector({ results, bestPick, selected, onSelect }: NzDownloadSelectorProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const display = selected ?? bestPick;

  if (results.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Best match card */}
      {display && (
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className={cn(
            'w-full flex items-center gap-3 rounded-xl border border-border/20 bg-[var(--dk-surface-raised)] p-3 text-left transition-colors',
            'hover:bg-[var(--dk-surface-glass)]',
            selected && 'border-primary/30 bg-primary/5',
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/10">
            <Zap className="h-4 w-4 text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{display.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <HardDrive className="h-3 w-3" />
                {formatSize(display.size)}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(display.pubDate).toLocaleDateString()}
              </span>
              {display.category && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">{display.category}</span>
              )}
            </div>
          </div>
          {results.length > 1 && (
            <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', showDropdown && 'rotate-180')} />
          )}
        </button>
      )}

      {/* Dropdown with alternatives */}
      {showDropdown && results.length > 1 && (
        <div className="rounded-xl border border-border/20 bg-[var(--dk-surface-base)] overflow-hidden max-h-64 overflow-y-auto">
          {results.map((result) => (
            <button
              key={result.guid}
              onClick={() => {
                onSelect(result);
                setShowDropdown(false);
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs transition-colors hover:bg-[var(--dk-surface-glass)]',
                selected?.guid === result.guid && 'bg-primary/5',
                result.guid === display?.guid && 'bg-muted/10',
              )}
            >
              <span className="font-medium truncate flex-1">{result.title}</span>
              <span className="shrink-0 text-muted-foreground">{formatSize(result.size)}</span>
              <span className="shrink-0 text-muted-foreground">
                {new Date(result.pubDate).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
