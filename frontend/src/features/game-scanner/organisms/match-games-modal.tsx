// frontend/src/features/game-scanner/organisms/match-games-modal.tsx
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  X,
  Search,
  Gamepad2,
  Link2,
  CheckCircle2,
  ChevronRight,
  Loader2,
  ExternalLink,
  Globe,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient } from "@/lib/api-client";
import { DkBadge } from "@/features/dk-ui/atoms/badge";
import { DkButton } from "@/features/dk-ui/atoms/button";
import { cn } from "@/lib/utils";
import type { DetectedGame } from "../types";

interface OtixGame {
  id: string;
  title: string;
  slug: string;
  posterUrl?: string;
  releaseDate?: string;
  source?: string;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OtixGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const selectedGame = unmatched.find((g) => g.id === selectedId);

  // Auto-search when selecting a game
  useEffect(() => {
    if (selectedId) {
      const game = games.find((g) => g.id === selectedId);
      if (game) {
        setQuery(game.title);
        // Trigger search immediately with game title
        setLoading(true);
        apiClient
          .get<{
            items: Array<{
              id: string;
              title: string;
              slug: string;
              posterUrl: string | null;
              releaseDate: string | null;
            }>;
          }>("/media/search", {
            params: { q: game.title, media_type: "game", sort_by: "popularity", limit: 6 },
          })
          .then(({ data }) => {
            setResults(
              data.items.map((item) => ({
                id: item.id,
                title: item.title,
                slug: item.slug,
                posterUrl: item.posterUrl ?? undefined,
                releaseDate: item.releaseDate ?? undefined,
                source: "otix",
              })),
            );
          })
          .catch(() => setResults([]))
          .finally(() => setLoading(false));
      }
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (q.length < 2) {
        setResults([]);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const { data } = await apiClient.get<{
            items: Array<{
              id: string;
              title: string;
              slug: string;
              posterUrl: string | null;
              releaseDate: string | null;
            }>;
          }>("/media/search", {
            params: { q, media_type: "game", sort_by: "popularity", limit: 6 },
          });
          setResults(
            data.items.map((item) => ({
              id: item.id,
              title: item.title,
              slug: item.slug,
              posterUrl: item.posterUrl ?? undefined,
              releaseDate: item.releaseDate ?? undefined,
              source: "otix",
            })),
          );
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 250);
    },
    [],
  );

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Auto-select first unmatched game
  useEffect(() => {
    if (open && unmatched.length > 0 && !selectedId) {
      setSelectedId(unmatched[0].id);
    }
  }, [open, unmatched, selectedId]);

  const handleLink = async (game: DetectedGame, otixGame: OtixGame) => {
    setLinking(game.id);
    try {
      onLinkGame(game.id, otixGame.id, otixGame.title, otixGame.slug);
      setLinked((prev) => new Set(prev).add(game.id));
      // Auto-advance to next unmatched game
      const remaining = unmatched.filter(
        (g) => g.id !== game.id && !linked.has(g.id),
      );
      if (remaining.length > 0) {
        setSelectedId(remaining[0].id);
      } else {
        setSelectedId(null);
      }
    } catch {
      // parent handles state
    } finally {
      setLinking(null);
    }
  };

  const handleSkip = () => {
    const remaining = unmatched.filter(
      (g) => g.id !== selectedId && !linked.has(g.id),
    );
    if (remaining.length > 0) {
      setSelectedId(remaining[0].id);
    } else {
      setSelectedId(null);
    }
  };

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
          className="relative flex max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-[2rem] bg-[var(--dk-surface-overlay)] shadow-[var(--dk-shadow-dialog)] backdrop-blur-xl ring-1 ring-white/[0.04]"
        >
          {/* Left: unmatched games list */}
          <div className="flex w-72 flex-shrink-0 flex-col border-r border-white/[0.04]">
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold text-foreground">
                  Match Games
                </h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-xl p-1.5 text-muted-foreground transition-colors hover:bg-[var(--dk-surface-glass)] hover:text-foreground active:scale-90"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 pb-2">
              <p className="text-xs text-muted-foreground">
                {unmatched.length - linked.size} unmatched ·{" "}
                {linked.size} linked
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {unmatched.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <CheckCircle2 className="h-8 w-8 text-green-400/60" />
                  <p className="text-sm text-muted-foreground">
                    All games matched
                  </p>
                </div>
              )}

              {unmatched.map((game) => {
                const isSelected = selectedId === game.id;
                const isLinked = linked.has(game.id);

                if (isLinked) return null;

                return (
                  <button
                    key={game.id}
                    onClick={() => setSelectedId(game.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
                      isSelected
                        ? "bg-primary/10 ring-1 ring-primary/20"
                        : "hover:bg-[var(--dk-surface-glass)]",
                    )}
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--dk-surface-glass)]">
                      {game.iconUrl ? (
                        <img
                          src={game.iconUrl}
                          alt=""
                          className="h-6 w-6 object-contain"
                        />
                      ) : (
                        <Gamepad2 className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {game.title}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground capitalize">
                        {game.platform}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/40" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: search + results */}
          <div className="flex flex-1 flex-col min-w-0">
            {selectedGame ? (
              <>
                {/* Search bar */}
                <div className="px-6 pt-4 pb-3">
                  <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(e) => handleSearch(e.target.value)}
                      placeholder="Refine search..."
                      className="h-12 w-full rounded-xl bg-[var(--dk-surface-glass)] pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)] focus:ring-offset-1"
                    />
                  </div>
                  <DkButton variant="ghost" size="sm" onClick={handleSkip}>
                    Skip
                  </DkButton>
                </div>

                  {/* Selected game info */}
                  <div className="mt-3 flex items-center gap-3 rounded-xl bg-[var(--dk-surface-glass)] px-3 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--dk-surface-base)]">
                      {selectedGame.iconUrl ? (
                        <img
                          src={selectedGame.iconUrl}
                          alt=""
                          className="h-5 w-5 object-contain"
                        />
                      ) : (
                        <Gamepad2 className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">
                        {selectedGame.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[300px]">
                        {selectedGame.installDir}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Results */}
                <div className="flex-1 overflow-y-auto px-6 pb-4">
                  {loading && (
                    <div className="flex items-center justify-center gap-2 py-12">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">
                        Searching...
                      </p>
                    </div>
                  )}

                  {!loading && query.length >= 2 && results.length === 0 && (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <Gamepad2 className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">
                        No games found
                      </p>
                      <p className="text-xs text-muted-foreground/50">
                        Try a different search term
                      </p>
                    </div>
                  )}

                  {!loading && query.length < 2 && (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <Search className="h-8 w-8 text-muted-foreground/20" />
                      <p className="text-sm text-muted-foreground">
                        Search for a game to link
                      </p>
                      <p className="text-xs text-muted-foreground/50">
                        Type at least 2 characters
                      </p>
                    </div>
                  )}

                  {!loading && results.length > 0 && (
                    <div className="space-y-1">
                      {results.map((otixGame) => {
                        const isCurrentLinking =
                          linking === selectedGame.id;
                        const year = otixGame.releaseDate
                          ? new Date(otixGame.releaseDate).getFullYear()
                          : null;

                        return (
                          <button
                            key={otixGame.id}
                            onClick={() =>
                              handleLink(selectedGame, otixGame)
                            }
                            disabled={isCurrentLinking}
                            className={cn(
                              "flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left transition-all",
                              "hover:bg-primary/5 active:scale-[0.99]",
                              "disabled:opacity-40",
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
                              <p className="text-sm font-semibold truncate">
                                {otixGame.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {[year?.toString()]
                                  .filter(Boolean)
                                  .join(" · ") || "Otix Library"}
                              </p>
                            </div>

                            {isCurrentLinking ? (
                              <Loader2 className="h-5 w-5 animate-spin text-primary flex-shrink-0" />
                            ) : (
                              <div className="flex-shrink-0 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100">
                                Link
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-center">
                  <CheckCircle2 className="h-10 w-10 text-green-400/60" />
                  <p className="text-sm font-semibold text-foreground">
                    All games matched
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Every local game is linked to an Otix entry
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
