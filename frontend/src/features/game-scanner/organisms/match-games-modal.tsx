// frontend/src/features/game-scanner/organisms/match-games-modal.tsx
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  X,
  Gamepad2,
  Link2,
  CheckCircle2,
  Loader2,
  Search,
  ExternalLink,
  Unlink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient } from "@/lib/api-client";
import { DkButton } from "@/features/dk-ui/atoms/button";
import { cn } from "@/lib/utils";
import type { DetectedGame } from "../types";

// ── Types ──

interface OtixResult {
  id: string;
  title: string;
  slug: string;
  posterUrl?: string | null;
  releaseDate?: string | null;
}

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
  otixResults: OtixResult[];
  sgResults: SteamGridResult[];
  loadingOtix: boolean;
  loadingSg: boolean;
  query: string;
  searchMode: "otix" | "steamgrid";
}

type TabId = "all" | "unmatched" | "matched";

interface MatchGamesModalProps {
  open: boolean;
  onClose: () => void;
  games: DetectedGame[];
  onLinkGame: (gameId: string, mediaId: string, title: string, slug: string) => void;
  onUnlinkGame?: (gameId: string) => void;
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

function platformLabel(game: DetectedGame): string {
  if (game.sources && game.sources.length > 1) {
    return game.sources.map((s) => PLATFORM_LABELS[s] ?? s).join(" + ");
  }
  return PLATFORM_LABELS[game.platform] ?? "PC";
}

function getGameHashHue(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

// ── Component ──

export function MatchGamesModal({
  open,
  onClose,
  games,
  onLinkGame,
  onUnlinkGame,
}: MatchGamesModalProps) {
  const matched = useMemo(() => games.filter((g) => !!g.otixMediaId), [games]);
  const unmatched = useMemo(() => games.filter((g) => !g.otixMediaId), [games]);

  const [activeTab, setActiveTab] = useState<TabId>("unmatched");

  // Batch Otix match suggestions
  const [batchSuggestions, setBatchSuggestions] = useState<Map<string, MatchSuggestion>>(new Map());
  const [batchLoading, setBatchLoading] = useState(false);

  // Per-row search state
  const [rowStates, setRowStates] = useState<Record<string, GameRowState>>({});
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

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
    setActiveTab("unmatched");

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
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Search helpers ──
  const ensureRow = useCallback((gameId: string, gameTitle: string) => {
    setRowStates((prev) => {
      if (prev[gameId]) return prev;
      return {
        ...prev,
        [gameId]: {
          otixResults: [],
          sgResults: [],
          loadingOtix: false,
          loadingSg: false,
          query: gameTitle,
          searchMode: "otix",
        },
      };
    });
  }, []);

  const searchOtix = useCallback(async (gameId: string, query: string) => {
    setRowStates((prev) => ({
      ...prev,
      [gameId]: { ...prev[gameId], loadingOtix: true, query, searchMode: "otix" },
    }));
    try {
      const { data } = await apiClient.get<{ items: OtixResult[] }>("/media/search", {
        params: { q: query, media_type: "game", limit: 6 },
      });
      setRowStates((prev) => ({
        ...prev,
        [gameId]: { ...prev[gameId], otixResults: data.items, loadingOtix: false },
      }));
    } catch {
      setRowStates((prev) => ({
        ...prev,
        [gameId]: { ...prev[gameId], otixResults: [], loadingOtix: false },
      }));
    }
  }, []);

  const searchSteamGrid = useCallback(async (gameId: string, query: string) => {
    setRowStates((prev) => ({
      ...prev,
      [gameId]: { ...prev[gameId], loadingSg: true, query, searchMode: "steamgrid" },
    }));
    try {
      const { data } = await apiClient.post<{ items: SteamGridResult[] }>(
        "/media/search-steamgrid",
        { query },
      );
      setRowStates((prev) => ({
        ...prev,
        [gameId]: { ...prev[gameId], sgResults: data.items, loadingSg: false },
      }));
    } catch {
      setRowStates((prev) => ({
        ...prev,
        [gameId]: { ...prev[gameId], sgResults: [], loadingSg: false },
      }));
    }
  }, []);

  // ── Auto-search when expanding a row ──
  const handleExpandRow = useCallback(
    (game: DetectedGame) => {
      ensureRow(game.id, game.title);
      const row = rowStatesRef.current[game.id];
      if (!row || (row.otixResults.length === 0 && !row.loadingOtix)) {
        searchOtix(game.id, game.title);
      }
    },
    [ensureRow, searchOtix],
  );

  // ── Link / Unlink ──
  const handleLinkOtix = useCallback(
    (gameId: string, result: OtixResult) => {
      onLinkGame(gameId, result.id, result.title, result.slug);
      setConfirmed((prev) => new Set(prev).add(gameId));
    },
    [onLinkGame],
  );

  const handleLinkSg = useCallback(
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

  const handleAcceptSuggestion = useCallback(
    (gameId: string) => {
      const suggestion = batchSuggestions.get(gameId);
      if (!suggestion?.matchedMedia) return;
      const m = suggestion.matchedMedia;
      onLinkGame(gameId, m.id, m.title, m.slug);
      setConfirmed((prev) => new Set(prev).add(gameId));
    },
    [batchSuggestions, onLinkGame],
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

  // ── Tab counts ──
  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "all", label: "All Games", count: games.length },
    { id: "unmatched", label: "Unmatched", count: unmatched.length },
    { id: "matched", label: "Matched", count: matched.length },
  ];

  const displayGames = useMemo(() => {
    switch (activeTab) {
      case "matched":
        return matched;
      case "unmatched":
        return unmatched;
      default:
        return games;
    }
  }, [activeTab, matched, unmatched, games]);

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
          className="relative flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] bg-[var(--dk-surface-overlay)] shadow-[var(--dk-shadow-dialog)] backdrop-blur-xl ring-1 ring-white/[0.04]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.04] px-6 py-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Link2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Match Games</h2>
                <p className="text-xs text-muted-foreground">
                  {games.length} games · {matched.length} matched · {matchableCount} suggestions
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {matchableCount > 0 && !batchLoading && (
                <DkButton size="sm" variant="ghost" onClick={handleConfirmAll}>
                  Confirm All ({matchableCount})
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

          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-white/[0.04] px-6 py-2 flex-shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative px-4 py-2 text-sm font-medium rounded-lg transition-all",
                  activeTab === tab.id
                    ? "text-foreground bg-[var(--dk-surface-glass)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)]/50",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                    activeTab === tab.id
                      ? "bg-primary/20 text-primary"
                      : "bg-white/[0.04] text-muted-foreground",
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
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

            {/* No games in this tab */}
            {!batchLoading && displayGames.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-400/60" />
                <p className="text-sm font-semibold text-foreground">
                  {activeTab === "matched" ? "No matched games yet" : "All games matched"}
                </p>
                {activeTab === "matched" && unmatched.length > 0 && (
                  <DkButton size="sm" variant="ghost" onClick={() => setActiveTab("unmatched")}>
                    View {unmatched.length} unmatched
                  </DkButton>
                )}
              </div>
            )}

            {/* Game list */}
            {!batchLoading &&
              displayGames.map((game) => {
                const isGameMatched = !!game.otixMediaId;
                const suggestion = batchSuggestions.get(game.id);
                const row = rowStates[game.id];
                const isExpanded = !!row;

                // ── Matched game row (compact) ──
                if (isGameMatched) {
                  return (
                    <div
                      key={game.id}
                      className="mb-3 flex items-center gap-4 rounded-2xl bg-[var(--dk-surface-base)] p-3 shadow-[var(--dk-shadow-sm)] ring-1 ring-green-500/10"
                    >
                      {/* Game art */}
                      <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-[var(--dk-surface-glass)] ring-1 ring-white/[0.04]">
                        {game.otixPosterUrl || game.posterUrl || game.iconUrl ? (
                          <img
                            src={(game.otixPosterUrl || game.posterUrl || game.iconUrl)!}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div
                            className="flex h-full w-full items-center justify-center"
                            style={{
                              background: `linear-gradient(135deg, oklch(0.25 0.08 ${getGameHashHue(game.title)}), oklch(0.18 0.06 ${(getGameHashHue(game.title) + 40) % 360}))`,
                            }}
                          >
                            <Gamepad2 className="h-6 w-6 text-white/20" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold">
                            {game.otixMediaTitle || game.title}
                          </p>
                          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-green-400" />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {game.otixMediaTitle && game.otixMediaTitle !== game.title
                            ? `Local: ${game.title}`
                            : platformLabel(game)}
                          {game.otixMediaTitle && game.otixMediaTitle !== game.title && (
                            <> · {platformLabel(game)}</>
                          )}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {game.otixMediaSlug && (
                          <a
                            href={`/media/game/${game.otixMediaSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)] transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        {onUnlinkGame && (
                          <button
                            onClick={() => onUnlinkGame(game.id)}
                            className="rounded-lg p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Unlink className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                // ── Unmatched game row ──
                return (
                  <div
                    key={game.id}
                    className={cn(
                      "mb-4 rounded-2xl bg-[var(--dk-surface-base)] transition-all",
                      isExpanded ? "shadow-[var(--dk-shadow-md)]" : "shadow-[var(--dk-shadow-sm)]",
                    )}
                  >
                    {/* Game header — click to expand */}
                    <button
                      onClick={() => handleExpandRow(game)}
                      className="w-full flex items-center gap-4 p-4 text-left"
                    >
                      {/* Icon */}
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--dk-surface-glass)] ring-1 ring-white/[0.04]">
                        {game.iconUrl ? (
                          <img src={game.iconUrl} alt="" className="h-8 w-8 object-contain" />
                        ) : (
                          <Gamepad2 className="h-6 w-6 text-muted-foreground/40" />
                        )}
                      </div>

                      {/* Title + platform */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{game.title}</p>
                        <p className="text-xs text-muted-foreground">{platformLabel(game)}</p>
                      </div>

                      {/* Suggestion badge */}
                      {suggestion?.matchedMedia && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold text-blue-400">
                            {Math.round(suggestion.confidence * 100)}% match
                          </span>
                          <DkButton
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAcceptSuggestion(game.id);
                            }}
                            className="text-xs"
                          >
                            Accept
                          </DkButton>
                        </div>
                      )}

                      {confirmed.has(game.id) && (
                        <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0" />
                      )}
                    </button>

                    {/* Expanded search area */}
                    {isExpanded && (
                      <div className="border-t border-white/[0.04] px-4 py-4">
                        {/* Search bar + mode toggle */}
                        <div className="flex items-center gap-2 mb-4">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40 pointer-events-none" />
                            <input
                              type="text"
                              value={row.query}
                              onChange={(e) => {
                                setRowStates((prev) => ({
                                  ...prev,
                                  [game.id]: { ...prev[game.id], query: e.target.value },
                                }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  if (row.searchMode === "otix") {
                                    searchOtix(game.id, row.query);
                                  } else {
                                    searchSteamGrid(game.id, row.query);
                                  }
                                }
                              }}
                              placeholder={
                                row.searchMode === "otix"
                                  ? "Search your Otix library..."
                                  : "Search SteamGridDB..."
                              }
                              className="h-10 w-full rounded-xl bg-[var(--dk-surface-glass)] pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)] focus:ring-offset-1"
                            />
                          </div>
                          <div className="flex rounded-lg bg-[var(--dk-surface-glass)] p-0.5">
                            <button
                              onClick={() => {
                                setRowStates((prev) => ({
                                  ...prev,
                                  [game.id]: { ...prev[game.id], searchMode: "otix" },
                                }));
                                if (row.otixResults.length === 0 && !row.loadingOtix) {
                                  searchOtix(game.id, row.query);
                                }
                              }}
                              className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                row.searchMode === "otix"
                                  ? "bg-primary/20 text-primary"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              Otix
                            </button>
                            <button
                              onClick={() => {
                                setRowStates((prev) => ({
                                  ...prev,
                                  [game.id]: { ...prev[game.id], searchMode: "steamgrid" },
                                }));
                                if (row.sgResults.length === 0 && !row.loadingSg) {
                                  searchSteamGrid(game.id, row.query);
                                }
                              }}
                              className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                row.searchMode === "steamgrid"
                                  ? "bg-primary/20 text-primary"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              SteamGrid
                            </button>
                          </div>
                        </div>

                        {/* Suggestion callout */}
                        {suggestion?.matchedMedia && (
                          <div className="mb-4 flex items-center gap-3 rounded-xl bg-blue-500/5 p-3 ring-1 ring-blue-500/10">
                            <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--dk-surface-glass)]">
                              {suggestion.matchedMedia.posterUrl ? (
                                <img
                                  src={suggestion.matchedMedia.posterUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <Gamepad2 className="h-5 w-5 text-muted-foreground/30" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-blue-400">
                                {suggestion.matchedMedia.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {Math.round(suggestion.confidence * 100)}% confidence match from Otix
                              </p>
                            </div>
                            <DkButton size="sm" onClick={() => handleAcceptSuggestion(game.id)}>
                              Match
                            </DkButton>
                          </div>
                        )}

                        {/* Otix results */}
                        {row.searchMode === "otix" && (
                          <>
                            {row.loadingOtix && (
                              <div className="flex items-center gap-2 py-8 justify-center">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                <p className="text-xs text-muted-foreground">Searching Otix...</p>
                              </div>
                            )}
                            {!row.loadingOtix && row.otixResults.length === 0 && (
                              <p className="text-xs text-muted-foreground/50 text-center py-4">
                                No results. Try a different search term.
                              </p>
                            )}
                            {!row.loadingOtix && row.otixResults.length > 0 && (
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {row.otixResults.map((result) => (
                                  <button
                                    key={result.id}
                                    onClick={() => handleLinkOtix(game.id, result)}
                                    className="group flex items-center gap-3 rounded-xl bg-[var(--dk-surface-glass)] p-2.5 text-left ring-1 ring-white/[0.02] transition-all hover:ring-primary/20 hover:bg-[var(--dk-surface-glass-hover)] hover:scale-[1.02] active:scale-[0.98]"
                                  >
                                    <div className="h-12 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--dk-surface-base)]">
                                      {result.posterUrl ? (
                                        <img
                                          src={result.posterUrl}
                                          alt=""
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                          <Gamepad2 className="h-4 w-4 text-muted-foreground/30" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-semibold">{result.title}</p>
                                      {result.releaseDate && (
                                        <p className="text-[10px] text-muted-foreground">
                                          {new Date(result.releaseDate).getFullYear()}
                                        </p>
                                      )}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}

                        {/* SteamGrid results */}
                        {row.searchMode === "steamgrid" && (
                          <>
                            {row.loadingSg && (
                              <div className="flex items-center gap-2 py-8 justify-center">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                <p className="text-xs text-muted-foreground">Searching SteamGridDB...</p>
                              </div>
                            )}
                            {!row.loadingSg && row.sgResults.length === 0 && (
                              <p className="text-xs text-muted-foreground/50 text-center py-4">
                                No results. Try a different search term.
                              </p>
                            )}
                            {!row.loadingSg && row.sgResults.length > 0 && (
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {row.sgResults.map((sg) => (
                                  <button
                                    key={sg.sgdbId}
                                    onClick={() => handleLinkSg(game.id, sg)}
                                    className="group overflow-hidden rounded-xl bg-[var(--dk-surface-glass)] ring-1 ring-white/[0.04] transition-all hover:ring-primary/30 hover:scale-[1.02] active:scale-[0.98]"
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
                                          <Gamepad2 className="h-6 w-6 text-muted-foreground/20" />
                                        </div>
                                      )}
                                    </div>
                                    {/* Label */}
                                    <div className="p-2.5">
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
                          </>
                        )}
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
