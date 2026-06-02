import { useState, useRef, useEffect, useCallback } from 'react';
import { Link2, Search, Check, X, ExternalLink, Gamepad2, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { DkDialog } from '@/features/dk-ui/molecules/dialog';
import { cn } from '@/lib/utils';

interface OtixGame {
  id: string;
  title: string;
  slug: string;
  posterUrl?: string;
  releaseDate?: string;
}

interface MediaItemSummary {
  id: string;
  media_type: string;
  title: string;
  slug: string;
  poster_url: string | null;
  release_date: string | null;
  avg_rating: number | null;
}

interface MediaItemListResponse {
  items: MediaItemSummary[];
  backfill_pending: boolean;
  has_more: boolean;
  total: number | null;
}

interface Props {
  gameTitle: string;
  isLinked: boolean;
  linkedTitle?: string;
  linkedId?: string;
  onLink: (mediaId: string, mediaTitle: string, mediaSlug: string) => void;
  onUnlink: () => void;
}

const MIN_OTIX_RESULTS = 4;
const POLL_INTERVAL_MS = 3000;

export function GameLinker({ gameTitle, isLinked, linkedTitle, linkedId, onLink, onUnlink }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OtixGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [error, setError] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const searchOtix = useCallback(async (q: string, signal?: AbortSignal) => {
    if (q.length < 2) {
      setResults([]);
      setError('');
      return 0;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get<MediaItemListResponse>('/media/search', {
        params: { q, media_type: 'game', limit: 8 },
        signal,
      });
      const mapped = data.items.map((item) => ({
        id: item.id,
        title: item.title,
        slug: item.slug,
        posterUrl: item.poster_url ?? undefined,
        releaseDate: item.release_date ?? undefined,
      }));
      setResults(mapped);
      return mapped.length;
    } catch {
      setError('Search failed. Try again.');
      setResults([]);
      return 0;
    } finally {
      setLoading(false);
    }
  }, []);

  const searchExternal = useCallback(async (q: string, signal?: AbortSignal) => {
    if (signal?.aborted) return;
    setLoadingExternal(true);
    let stillPending = false;
    try {
      const { data } = await apiClient.get<MediaItemListResponse>('/media/search/external', {
        params: { q, limit: 8 },
        signal,
      });

      if (signal?.aborted) return;

      setResults((prev) => {
        const existingIds = new Set(prev.map((g) => g.id));
        const newItems: OtixGame[] = data.items
          .filter((item) => !existingIds.has(item.id))
          .map((item) => ({
            id: item.id,
            title: item.title,
            slug: item.slug,
            posterUrl: item.poster_url ?? undefined,
            releaseDate: item.release_date ?? undefined,
          }));
        return [...prev, ...newItems];
      });

      stillPending = data.backfill_pending;

      // Schedule poll if more imports are pending
      if (stillPending && mountedRef.current && !signal?.aborted) {
        pollTimerRef.current = setTimeout(() => {
          searchExternal(q, signal);
        }, POLL_INTERVAL_MS);
      }
    } catch {
      // Silently fail
    } finally {
      // Keep loading=true during polling gap so "No games found" doesn't flash
      if (mountedRef.current && !stillPending) {
        setLoadingExternal(false);
      }
    }
  }, []);

  const handleOpen = () => {
    setQuery(gameTitle);
    setIsOpen(true);
    setHighlightedIndex(-1);
    setError('');
    setSubmitting(false);
    setTimeout(() => inputRef.current?.focus(), 50);
    if (gameTitle.length >= 2) {
      searchOtix(gameTitle);
    }
  };

  const handleSelect = async (game: OtixGame) => {
    onLink(game.id, game.title, game.slug);
    setIsOpen(false);
  };

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;

    // Clear any in-flight external poll
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setHighlightedIndex(-1);

    if (query.length < 2) {
      setResults([]);
      setError('');
      return;
    }

    const controller = new AbortController();

    debounceRef.current = setTimeout(async () => {
      const count = await searchOtix(query, controller.signal);
      if (count < MIN_OTIX_RESULTS) {
        await searchExternal(query, controller.signal);
      }
    }, 300);

    return () => {
      controller.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [query, isOpen, searchOtix, searchExternal]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (submitting) return;
    const maxIdx = results.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < maxIdx ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : maxIdx));
    } else if (e.key === 'Enter' && highlightedIndex >= 0 && results[highlightedIndex]) {
      e.preventDefault();
      handleSelect(results[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  // ── Linked state ──
  if (isLinked) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <a
          href={`/media/game/${linkedId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-xs font-semibold transition-colors no-underline"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3" />
          <span className="truncate max-w-[120px]">{linkedTitle}</span>
        </a>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUnlink();
          }}
          className="p-1 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
          aria-label="Unlink from Otix"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // ── Unlinked state ──
  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleOpen();
        }}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-400 border border-white/5 hover:border-emerald-500/20 text-xs font-semibold transition-colors cursor-pointer"
        title="Link to Otix game"
      >
        <Link2 className="w-3 h-3" />
        Link to Otix
      </button>

      <DkDialog open={isOpen} onOpenChange={(open) => { if (!submitting) setIsOpen(open); }} className="max-w-lg p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <Link2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Link to Otix</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Find and link this game to your Otix library
            </p>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search games..."
            disabled={submitting}
            className="w-full h-10 rounded-xl bg-[var(--dk-surface-raised)] pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none ring-1 ring-border/30 focus:ring-primary/40 transition-all disabled:opacity-40"
          />
        </div>

        {/* Results area */}
        <div ref={listRef} className="mt-3 max-h-72 overflow-y-auto -mx-1 px-1 space-y-3">
          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="h-12 w-12 rounded-xl bg-muted/30 animate-pulse shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3.5 w-32 rounded bg-muted/30 animate-pulse" />
                    <div className="h-2.5 w-16 rounded bg-muted/20 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <AlertCircle className="h-5 w-5 text-destructive/60" />
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          )}

          {/* Empty state (no results, not loading, no external search running) */}
          {!loading && !error && query.length >= 2 && results.length === 0 && !loadingExternal && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Gamepad2 className="h-5 w-5 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No games found for "{query}"</p>
              <p className="text-xs text-muted-foreground/50">Try a different search term</p>
            </div>
          )}

          {/* Empty state before typing */}
          {!loading && !error && query.length < 2 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Search className="h-5 w-5 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Type to search your Otix game library</p>
            </div>
          )}

          {/* Search results */}
          {!loading && !error && results.length > 0 && (
            <div>
              <div className="space-y-0.5">
                {results.map((game, index) => {
                  const isHighlighted = index === highlightedIndex;
                  const year = game.releaseDate
                    ? new Date(game.releaseDate).getFullYear()
                    : null;

                  return (
                    <button
                      key={game.id}
                      onClick={() => handleSelect(game)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all',
                        isHighlighted
                          ? 'bg-emerald-500/10 ring-1 ring-emerald-500/20'
                          : 'hover:bg-[var(--dk-surface-glass)]',
                      )}
                    >
                      <div className="h-12 w-12 rounded-xl bg-muted/30 overflow-hidden shrink-0 ring-1 ring-border/10">
                        {game.posterUrl ? (
                          <img
                            src={game.posterUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-muted-foreground/30">
                            <Gamepad2 className="h-5 w-5" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{game.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {year?.toString() || 'Unknown'}
                        </p>
                      </div>

                      {isHighlighted && (
                        <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Importing from IGDB indicator (shown during initial external search + polling) */}
          {loadingExternal && !loading && (
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="h-3 w-3 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 animate-spin" />
              <p className="text-xs text-muted-foreground">
                {results.length === 0
                  ? 'Importing games from IGDB...'
                  : 'Checking for new imports...'}
              </p>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <p className="text-[10px] text-muted-foreground/50 text-center mt-3">
          Press <kbd className="px-1 py-0.5 rounded bg-[var(--dk-surface-raised)] text-[10px]">↑↓</kbd> to navigate · <kbd className="px-1 py-0.5 rounded bg-[var(--dk-surface-raised)] text-[10px]">↵</kbd> to select · <kbd className="px-1 py-0.5 rounded bg-[var(--dk-surface-raised)] text-[10px]">Esc</kbd> to close
        </p>
      </DkDialog>
    </>
  );
}
