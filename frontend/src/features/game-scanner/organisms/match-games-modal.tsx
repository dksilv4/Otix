// frontend/src/features/game-scanner/organisms/match-games-modal.tsx
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  X,
  Gamepad2,
  Link2,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Search,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient } from "@/lib/api-client";
import { DkButton } from "@/features/dk-ui/atoms/button";
import { cn } from "@/lib/utils";
import type { DetectedGame } from "../types";

// ── Types ──

interface SteamGridResult {
  sgdbId: number;
  name: string;
  gridUrl?: string | null;
  logoUrl?: string | null;
  heroUrl?: string | null;
  iconUrl?: string | null;
}

interface MatchSuggestion {
  matchedMedia: {
    id: string;
    title: string;
    slug: string;
    posterUrl?: string | null;
  } | null;
  confidence: number;
}

interface GameRowState {
  results: SteamGridResult[];
  loading: boolean;
  query: string;
  loaded: boolean;
}

interface MatchGamesModalProps {
  open: boolean;
  onClose: () => void;
  games: DetectedGame[];
  onLinkGame: (gameId: string, mediaId: string, title: string, slug: string) => void;
}

// ── Helpers ──

const PLATFORM_LABELS: Record<string, string> = {
  steam: "Steam",
  pc: "PC",
  iso: "ISO",
  epic: "Epic",
  gog: "GOG",
  battlenet: "Battle.net",
  ubisoft: "Ubisoft",
  ea: "EA",
  riot: "Riot",
  xbox: "Xbox",
  itch: "Itch",
};

// ── Component ──

export function MatchGamesModal({
  open,
  onClose,
  games,
  onLinkGame,
}: MatchGamesModalProps) {
  const unmatched = useMemo(
    () => games.filter((g) => !g.otixMediaId),
    [games],
  );

  // Batch Otix match suggestions
  const [batchSuggestions, setBatchSuggestions] = useState<Map<string, MatchSuggestion>>(new Map());
  const [batchLoading, setBatchLoading] = useState(false);

  // Per-row SteamGrid search state (keyed by game ID)
  const [rowStates, setRowStates] = useState<Record<string, GameRowState>>({});
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

  // Ref to hold latest rowStates for the load-in-viewport effect
  const rowStatesRef = useRef(rowStates);
  rowStatesRef.current = rowStates;

  // ── Batch match on open ──
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      hasLoadedRef.current = false;
      return;
    }
    if (unmatched.length === 0 || hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    setBatchLoading(true);
    setBatchSuggestions(new Map());
    setConfirmed(new Set());
    setRowStates({});

    const titles = unmatched.map((g) => g.title);
    apiClient
      .post<{
        matches: Array<{
          queryTitle: string;
          matchedMedia: MatchSuggestion["matchedMedia"];
          confidence: number;
        }>;
      }>("/media/match-local-games", { titles })
      .then(({ data }) => {
        const map = new Map<string, MatchSuggestion>();
        for (const m of data.matches) {
          const game = unmatched.find((g) => g.title === m.queryTitle);
          if (game) map.set(game.id, { matchedMedia: m.matchedMedia, confidence: m.confidence });
        }
        setBatchSuggestions(map);
      })
      .catch(() => {})
      .finally(() => setBatchLoading(false));

    // Search all games sequentially (respect rate limits)
    let delay = 0;
    for (const game of unmatched) {
      setTimeout(() => searchForGame(game), delay);
      delay += 400; // 400ms between each to stay under SteamGridDB rate limit
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Search a single game via SteamGridDB ──
  const searchForGame = useCallback(
    async (game: DetectedGame) => {
      const gameId = game.id;
      // Already loaded or loading
      if (rowStatesRef.current[gameId]?.loaded || rowStatesRef.current[gameId]?.loading) return;

      setRowStates((prev) => ({
        ...prev,
        [gameId]: { results: [], loading: true, query: game.title, loaded: false },
      }));

      try {
        const { data } = await apiClient.post<{ items: SteamGridResult[] }>(
          "/media/search-steamgrid",
          { query: game.title },
        );
        setRowStates((prev) => ({
          ...prev,
          [gameId]: { results: data.items, loading: false, query: game.title, loaded: true },
        }));
      } catch {
        setRowStates((prev) => ({
          ...prev,
          [gameId]: { results: [], loading: false, query: game.title, loaded: true },
        }));
      }
    },
    [],
  );

  // ── Manual search for a row ──
  const handleManualSearch = useCallback(async (gameId: string, query: string) => {
    setRowStates((prev) => ({
      ...prev,
      [gameId]: { ...prev[gameId], query, loading: true },
    }));

    try {
      const { data } = await apiClient.post<{ items: SteamGridResult[] }>(
        "/media/search-steamgrid",
        { query },
      );
      setRowStates((prev) => ({
        ...prev,
        [gameId]: { ...prev[gameId], results: data.items, loading: false },
      }));
    } catch {
      setRowStates((prev) => ({
        ...prev,
        [gameId]: { ...prev[gameId], results: [], loading: false },
      }));
    }
  }, []);

  // ── Link a game ──
  const handleLink = useCallback(
    (gameId: string, sgResult: SteamGridResult) => {
      const suggestion = batchSuggestions.get(gameId);
      const mediaId = suggestion?.matchedMedia?.id ?? `sgdb:${sgResult.sgdbId}`;
      const title = suggestion?.matchedMedia?.title ?? sgResult.name;
      const slug = suggestion?.matchedMedia?.slug ?? sgResult.name.toLowerCase().replace(/\s+/g, "-");
      onLinkGame(gameId, mediaId, title, slug);
      setConfirmed((prev) => new Set(prev).add(gameId));
    },
    [onLinkGame, batchSuggestions],
  );

  const handleConfirmAll = useCallback(() => {
    for (const [gameId, suggestion] of batchSuggestions) {
      if (!confirmed.has(gameId) && suggestion.matchedMedia) {
        const m = suggestion.matchedMedia;
        onLinkGame(gameId, m.id, m.title, m.slug);
        setConfirmed((prev) => new Set(prev).add(gameId));
      }
    }
  }, [batchSuggestions, confirmed, onLinkGame]);

  const matchableCount = [...batchSuggestions.values()].filter((s) => s.matchedMedia).length;
  const visibleUnmatched = unmatched.filter((g) => !confirmed.has(g.id));

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] bg-[var(--dk-surface-overlay)] shadow-[var(--dk-shadow-dialog)] backdrop-blur-xl ring-1 ring-white/[0.04]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.04] px-6 py-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <Link2 className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold text-foreground">Match Games</h2>
                <p className="text-xs text-muted-foreground">
                  {unmatched.length} unmatched · {matchableCount} Otix suggestions
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {matchableCount > 0 && !batchLoading && (
                <DkButton size="sm" variant="ghost" onClick={handleConfirmAll}>
                  Confirm All
                </DkButton>
              )}
              <button
                onClick={onClose}
                className="rounded-xl p-1.5 text-muted-foreground transition-colors hover:bg-[var(--dk-surface-glass)] hover:text-foreground active:scale-90"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Batch loading */}
            {batchLoading && (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  Matching {unmatched.length} games against Otix catalog...
                </p>
              </div>
            )}

            {/* No unmatched */}
            {!batchLoading && visibleUnmatched.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-400/60" />
                <p className="text-sm font-semibold text-foreground">All games matched</p>
              </div>
            )}

            {/* Game rows — each row owns its search independently */}
            {!batchLoading &&
              visibleUnmatched.map((game) => {
                const row = rowStates[game.id];
                const results = row?.results ?? [];
                const isLoading = row?.loading ?? false;
                const isLoaded = row?.loaded ?? false;
                const query = row?.query ?? game.title;
                const suggestion = batchSuggestions.get(game.id);
                const platform =
                  game.sources && game.sources.length > 1
                    ? game.sources.map((s) => PLATFORM_LABELS[s] ?? s).join(" + ")
                    : PLATFORM_LABELS[game.platform] ?? "PC";

                return (
                  <div
                    key={game.id}
                    className="mb-4 rounded-2xl bg-[var(--dk-surface-base)] p-4 shadow-[var(--dk-shadow-sm)]"
                  >
                    {/* Game header */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--dk-surface-glass)]">
                        {game.iconUrl ? (
                          <img src={game.iconUrl} alt="" className="h-6 w-6 object-contain" />
                        ) : (
                          <Gamepad2 className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{game.title}</p>
                        <p className="text-xs text-muted-foreground">{platform}</p>
                      </div>

                      {/* Otix suggestion badge */}
                      {suggestion?.matchedMedia && (
                        <span className="flex-shrink-0 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                          {Math.round(suggestion.confidence * 100)}% Otix match
                        </span>
                      )}
                    </div>

                    {/* Search bar */}
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40 pointer-events-none" />
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => handleManualSearch(game.id, e.target.value)}
                        placeholder="Search SteamGridDB..."
                        className="h-10 w-full rounded-xl bg-[var(--dk-surface-glass)] pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)] focus:ring-offset-1"
                      />
                    </div>

                    {/* Results */}
                    {isLoading && (
                      <div className="flex items-center gap-2 py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <p className="text-xs text-muted-foreground">Searching SteamGridDB...</p>
                      </div>
                    )}

                    {isLoaded && results.length === 0 && (
                      <p className="text-xs text-muted-foreground/50 py-2">No results</p>
                    )}

                    {results.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {results.map((sg) => (
                          <button
                            key={sg.sgdbId}
                            onClick={() => handleLink(game.id, sg)}
                            className="group flex-shrink-0 w-[184px] rounded-xl overflow-hidden bg-[var(--dk-surface-glass)] ring-1 ring-white/[0.04] transition-all hover:ring-primary/30 hover:scale-[1.02] active:scale-[0.98]"
                          >
                            {/* Grid image */}
                            <div className="aspect-[2/1] w-full bg-[var(--dk-surface-base)]">
                              {sg.gridUrl ? (
                                <img
                                  src={sg.gridUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <Gamepad2 className="h-6 w-6 text-muted-foreground/30" />
                                </div>
                              )}
                            </div>

                            {/* Logo or name */}
                            <div className="p-2">
                              {sg.logoUrl ? (
                                <img
                                  src={sg.logoUrl}
                                  alt={sg.name}
                                  className="h-5 w-full object-contain object-left"
                                />
                              ) : (
                                <p className="text-xs font-semibold truncate">{sg.name}</p>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
