import { useCallback, useMemo, useState } from 'react';

import { getDesktopAPI, hasDesktopAPI } from '@/lib/desktop/api';
import { useLocalGames as useLocalGamesQuery, useAcceptSuggestion, useRejectSuggestion, type GamesFilter } from '@/old-features/game-scanner/game-queries';
import { useGameDetail, useGameGenres, usePopularGames } from '@/old-features/games/games-queries';

import type { GamesTab, CatalogGame, ShelfRow } from '../types';
import type { LocalGame } from '@/old-features/game-scanner/types';

// ── Shelves ──────────────────────────────────────────────────────────

function buildGameShelves(
  matchedGames: LocalGame[],
  unmatchedGames: LocalGame[],
  localGames: LocalGame[],
  popularGames: CatalogGame[],
): ShelfRow[] {
  const rows: ShelfRow[] = []

  if (matchedGames.length > 0) {
    rows.push({
      id: "matched",
      label: "Installed Games",
      icon: "✓",
      games: matchedGames.slice(0, 12),
    })
  }

  const suggested = localGames.filter((g) => g.matchSuggestion)
  if (suggested.length > 0) {
    rows.push({
      id: "suggested",
      label: "Suggested Matches",
      icon: "🔗",
      games: suggested.slice(0, 8),
    })
  }

  const unmatched = unmatchedGames.filter((g) => !g.matchSuggestion)
  if (unmatched.length > 0) {
    rows.push({
      id: "unmatched",
      label: "Unmatched Games",
      icon: "🔍",
      games: unmatched.slice(0, 8),
    })
  }

  if (popularGames.length > 0) {
    rows.push({
      id: "popular",
      label: "Popular on Otix",
      icon: "🔥",
      games: [],
      catalogGames: popularGames.slice(0, 12),
    })
  }

  return rows
}

// ── UI State ────────────────────────────────────────────────────────

/** Active tab, search, side panel, selected game, scanning flag. */
export function useGameUIState() {
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<GamesTab>('all');
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [scanning, setScanning] = useState(false);

  const selectGame = useCallback((id: string) => setSelectedLocalId(id), []);

  return {
    selectedLocalId,
    sidePanelOpen,
    activeTab,
    localSearchQuery,
    scanning,
    selectGame,
    setSidePanelOpen,
    setActiveTab,
    setLocalSearchQuery,
    setScanning,
  };
}

// ── Queries (DB-filtered, server-side) ──────────────────────────────

/** Derive GamesFilter from UI state so filtering happens in SQLite. */
function filterFromTab(tab: GamesTab, search: string): GamesFilter {
  const filter: GamesFilter = {};
  if (tab === 'matched') filter.matched = true;
  if (tab === 'unmatched') filter.matched = false;
  if (search.trim()) filter.search = search.trim();
  return filter;
}

/** Game data queries. Accepts UI filter params so DB does the work. */
export function useGameQueries(localGameId: string | null, activeTab: GamesTab, searchQuery: string) {
  const filter = useMemo(() => filterFromTab(activeTab, searchQuery), [activeTab, searchQuery]);
  const { data: localGames = [], isLoading } = useLocalGamesQuery(filter);

  const selectedLocalGame = useMemo(
    () => localGames.find((g) => g.id === localGameId) ?? localGames[0] ?? null,
    [localGames, localGameId],
  );

  const { data: gameDetail } = useGameDetail(selectedLocalGame?.data?.id);
  const { data: genres = [] } = useGameGenres();

  const matchedGames = useMemo(() => localGames.filter((g) => g.data?.id), [localGames]);
  const unmatchedGames = useMemo(() => localGames.filter((g) => !g.data?.id), [localGames]);
  const suggestionCount = localGames.filter((g) => g.matchSuggestion).length;

  return {
    localGames,
    isLoading,
    matchedGames,
    unmatchedGames,
    gameDetail,
    genres,
    selectedLocalGame,
    suggestionCount,
    matchedCount: matchedGames.length,
    unmatchedCount: unmatchedGames.length,
  };
}

// ── Shelves ─────────────────────────────────────────────────────────

/** Build game shelf data from matched/unmatched/popular games. */
export function useGameShelves(
  matchedGames: LocalGame[],
  unmatchedGames: LocalGame[],
  localGames: LocalGame[],
) {
  const { data: popularGames = [] } = usePopularGames();

  const shelves = useMemo(
    () => buildGameShelves(matchedGames, unmatchedGames, localGames, popularGames),
    [matchedGames, unmatchedGames, localGames, popularGames],
  );

  return { shelves };
}

// ── Actions ─────────────────────────────────────────────────────────

/** Game actions: play, open folder, rescan, accept/reject suggestions. */
export function useGameActions(setScanning: (v: boolean) => void) {
  const acceptSuggestion = useAcceptSuggestion();
  const rejectSuggestion = useRejectSuggestion();

  const handleAcceptSuggestion = useCallback(
    (game: LocalGame) => {
      if (!game.matchSuggestion) return;
      acceptSuggestion.mutate({
        gameId: game.id,
        suggestion: {
          id: game.matchSuggestion.id,
          title: game.matchSuggestion.title,
          platform: game.matchSuggestion.platform,
          iconUrl: game.matchSuggestion.iconUrl,
          posterUrl: game.matchSuggestion.posterUrl,
        },
      });
    },
    [acceptSuggestion],
  );

  const handleRejectSuggestion = useCallback(
    (game: LocalGame) => {
      if (!game.matchSuggestion) return;
      rejectSuggestion.mutate({
        gameId: game.id,
        suggestionMediaId: game.matchSuggestion.id,
      });
    },
    [rejectSuggestion],
  );

  const handleRescan = useCallback(async () => {
    if (!hasDesktopAPI()) return;
    const api = getDesktopAPI()!;
    setScanning(true);
    try {
      const paths = await api.getScanPaths();
      const gamePaths = paths.filter((p) => p.type === 'game').map((p) => p.path);
      const isoPaths = paths.filter((p) => p.type === 'iso').map((p) => p.path);
      await api.scanPaths(gamePaths, isoPaths);
    } catch (err) {
      console.error('Rescan failed:', err);
    } finally {
      setScanning(false);
    }
  }, [setScanning]);

  const handlePlay = useCallback((game: LocalGame) => {
    const api = getDesktopAPI();
    if (api) {
      api.launchGame(game).catch(console.error);
    }
  }, []);

  const handleOpenFolder = useCallback((game: LocalGame) => {
    const api = getDesktopAPI();
    if (api?.showItemInFolder) {
      api.showItemInFolder(game.installDir).catch(console.error);
    }
  }, []);

  return {
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleRescan,
    handlePlay,
    handleOpenFolder,
  };
}

