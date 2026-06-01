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

interface OtixGame {
  id: string;
  title: string;
  slug: string;
  posterUrl?: string;
  releaseDate?: string;
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

interface MatchGamesModalProps {
  open: boolean;
  onClose: () => void;
  games: DetectedGame[];
  onLinkGame: (gameId: string, mediaId: string, title: string, slug: string) => void;
}

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

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [batchSuggestions, setBatchSuggestions] = useState<
    Map<string, MatchSuggestion>
  >(new Map());
  const [batchLoading, setBatchLoading] = useState(false);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

  // Per-tab search state
  const [searchResults, setSearchResults] = useState<OtixGame[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Batch match all unmatched games on open
  useEffect(() => {
    if (!open || unmatched.length === 0) return;

    setBatchLoading(true);
    setBatchSuggestions(new Map());
    setConfirmed(new Set());
    setActiveTab(unmatched[0]?.id ?? null);

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
          if (game) {
            map.set(game.id, {
              matchedMedia: m.matchedMedia,
              confidence: m.confidence,
            });
          }
        }
        setBatchSuggestions(map);
      })
      .catch(() => {})
      .finally(() => setBatchLoading(false));
  }, [open, unmatched]);

  // Auto-search when tab changes
  useEffect(() => {
    if (!activeTab) {
      setSearchResults([]);
      setSearchQuery("");
      return;
    }

    const game = unmatched.find((g) => g.id === activeTab);
    if (!game) return;

    const query = game.title;
    setSearchQuery(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    setSearchLoading(true);
    apiClient
      .get<{ items: Array<{ id: string; title: string; slug: string; posterUrl: string | null; releaseDate: string | null }> }>(
        "/media/search",
        { params: { q: query, media_type: "game", sort_by: "popularity", limit: 6 } },
      )
      .then(({ data }) =>
        setSearchResults(
          data.items.map((item) => ({
            id: item.id,
            title: item.title,
            slug: item.slug,
            posterUrl: item.posterUrl ?? undefined,
            releaseDate: item.releaseDate ?? undefined,
          })),
        ),
      )
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false));
  }, [activeTab, unmatched]);

  // Manual search handler
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const { data } = await apiClient.get<{
          items: Array<{ id: string; title: string; slug: string; posterUrl: string | null; releaseDate: string | null }>;
        }>("/media/search", {
          params: { q, media_type: "game", sort_by: "popularity", limit: 6 },
        });
        setSearchResults(
          data.items.map((item) => ({
            id: item.id,
            title: item.title,
            slug: item.slug,
            posterUrl: item.posterUrl ?? undefined,
            releaseDate: item.releaseDate ?? undefined,
          })),
        );
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 250);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleLink = useCallback(
    (gameId: string, otixGame: OtixGame) => {
      onLinkGame(gameId, otixGame.id, otixGame.title, otixGame.slug);
      setConfirmed((prev) => new Set(prev).add(gameId));
      // Auto-advance to next unconfirmed tab
      const remaining = unmatched.filter(
        (g) => g.id !== gameId && !confirmed.has(g.id),
      );
      setActiveTab(remaining[0]?.id ?? null);
    },
    [onLinkGame, unmatched, confirmed],
  );

  const handleConfirmAll = useCallback(() => {
    for (const [gameId, suggestion] of batchSuggestions) {
      if (suggestion.matchedMedia && !confirmed.has(gameId)) {
        onLinkGame(
          gameId,
          suggestion.matchedMedia.id,
          suggestion.matchedMedia.title,
          suggestion.matchedMedia.slug,
        );
        setConfirmed((prev) => new Set(prev).add(gameId));
      }
    }
    setActiveTab(null);
  }, [batchSuggestions, confirmed, onLinkGame]);

  const activeGame = unmatched.find((g) => g.id === activeTab);
  const batchSuggestion = activeTab ? batchSuggestions.get(activeTab) : undefined;
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
          className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-[var(--dk-surface-overlay)] shadow-[var(--dk-shadow-dialog)] backdrop-blur-xl ring-1 ring-white/[0.04]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.04] px-6 py-4">
            <div className="flex items-center gap-3">
              <Link2 className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Match Games
                </h2>
                <p className="text-xs text-muted-foreground">
                  {unmatched.length} unmatched · {matchableCount} suggestions
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

          {/* Loading batch match */}
          {batchLoading && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Matching {unmatched.length} games against Otix catalog...
              </p>
            </div>
          )}

          {/* No unmatched */}
          {!batchLoading && unmatched.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-400/60" />
              <p className="text-sm font-semibold text-foreground">
                All games matched
              </p>
            </div>
          )}

          {/* Game tabs + content */}
          {!batchLoading && visibleUnmatched.length > 0 && (
            <>
              {/* Tab bar */}
              <div className="flex gap-1 overflow-x-auto border-b border-white/[0.04] px-3 py-2">
                {visibleUnmatched.map((game) => {
                  const suggestion = batchSuggestions.get(game.id);
                  const hasMatch = suggestion?.matchedMedia;
                  const isActive = activeTab === game.id;

                  return (
                    <button
                      key={game.id}
                      onClick={() => setActiveTab(game.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0",
                        isActive
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)]",
                        hasMatch && !isActive && "text-green-400/80",
                      )}
                    >
                      {game.iconUrl ? (
                        <img src={game.iconUrl} alt="" className="h-4 w-4 object-contain" />
                      ) : (
                        <Gamepad2 className="h-3.5 w-3.5" />
                      )}
                      <span className="max-w-[100px] truncate">{game.title}</span>
                      {hasMatch && (
                        <span className="text-[10px] opacity-60">
                          {Math.round(suggestion!.confidence * 100)}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Active tab content */}
              {activeGame && (
                <div className="flex-1 overflow-y-auto">
                  {/* Batch suggestion header */}
                  {batchSuggestion?.matchedMedia && (
                    <div className="mx-6 mt-4 flex items-center gap-4 rounded-xl bg-green-500/5 ring-1 ring-green-500/10 p-4">
                      <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-[var(--dk-surface-base)] ring-1 ring-white/[0.04]">
                        {batchSuggestion.matchedMedia.posterUrl ? (
                          <img
                            src={batchSuggestion.matchedMedia.posterUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Gamepad2 className="h-6 w-6 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-green-400">
                          Suggested Match · {Math.round(batchSuggestion.confidence * 100)}%
                        </p>
                        <p className="text-sm font-semibold truncate mt-0.5">
                          {batchSuggestion.matchedMedia.title}
                        </p>
                      </div>
                      <DkButton
                        size="sm"
                        onClick={() =>
                          handleLink(activeGame.id, {
                            id: batchSuggestion.matchedMedia!.id,
                            title: batchSuggestion.matchedMedia!.title,
                            slug: batchSuggestion.matchedMedia!.slug,
                            posterUrl: batchSuggestion.matchedMedia!.posterUrl ?? undefined,
                          })
                        }
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Confirm
                      </DkButton>
                    </div>
                  )}

                  {!batchSuggestion?.matchedMedia && (
                    <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl bg-amber-500/5 ring-1 ring-amber-500/10 p-3 text-xs text-muted-foreground">
                      <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
                      No automatic match found. Search below.
                    </div>
                  )}

                  {/* Search bar */}
                  <div className="px-6 pt-4 pb-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Refine search..."
                        className="h-12 w-full rounded-xl bg-[var(--dk-surface-glass)] pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)] focus:ring-offset-1"
                      />
                    </div>
                  </div>

                  {/* Search results */}
                  <div className="px-6 pb-6">
                    {searchLoading ? (
                      <div className="flex items-center justify-center gap-2 py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Searching...</p>
                      </div>
                    ) : searchResults.length > 0 ? (
                      <div className="space-y-1">
                        {searchResults.map((otixGame) => {
                          const isBatchMatch =
                            batchSuggestion?.matchedMedia?.id === otixGame.id;

                          return (
                            <button
                              key={otixGame.id}
                              onClick={() => handleLink(activeGame.id, otixGame)}
                              className={cn(
                                "flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left transition-all",
                                isBatchMatch
                                  ? "bg-green-500/5 ring-1 ring-green-500/10"
                                  : "hover:bg-primary/5",
                              )}
                            >
                              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-[var(--dk-surface-base)] ring-1 ring-white/[0.04]">
                                {otixGame.posterUrl ? (
                                  <img
                                    src={otixGame.posterUrl}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center">
                                    <Gamepad2 className="h-6 w-6 text-muted-foreground/30" />
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold truncate">
                                    {otixGame.title}
                                  </p>
                                  {isBatchMatch && (
                                    <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-400 flex-shrink-0">
                                      Best match
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {otixGame.releaseDate
                                    ? new Date(otixGame.releaseDate).getFullYear()
                                    : "Otix Library"}
                                </p>
                              </div>

                              <div className="flex-shrink-0 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                                Link
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-8 text-center">
                        <Search className="h-6 w-6 text-muted-foreground/20" />
                        <p className="text-xs text-muted-foreground">
                          No results — try different search
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
