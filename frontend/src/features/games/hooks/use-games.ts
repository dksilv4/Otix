import { useCallback, useEffect, useMemo, useState } from 'react';

import { getDesktopAPI, hasDesktopAPI } from '@/lib/desktop-api';
import { useGames as useLocalGamesQuery, useAcceptSuggestion, useRejectSuggestion, type GamesFilter } from '@/features/game-scanner/game-queries';
import { useGameDetail, useGameGenres, usePopularGames, useSeedFromTitles } from '@/features/games/games-queries';
import { buildGameShelves } from '@/features/games/_utils';

import type { GamesTab } from '../types';
import type { LocalGame } from '@/features/game-scanner/types';

export function useGames() {
  // ── Queries ──────────────────────────────────────────────────────

  const { data: localGames = [], isLoading } = useLocalGamesQuery();
  const acceptSuggestion = useAcceptSuggestion();
  const rejectSuggestion = useRejectSuggestion();

  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<GamesTab>('all');
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [scanning, setScanning] = useState(false);

  const seedMutation = useSeedFromTitles();

  const selectedLocalGame = useMemo(
    () => localGames.find((g) => g.id === selectedLocalId) ?? localGames[0] ?? null,
    [localGames, selectedLocalId],
  );

  const { data: gameDetail } = useGameDetail(selectedLocalGame?.data?.id);

  // ── Derived: filtered lists (server-side when possible, fallback for local UI) ──

  const matchedGames = useMemo(() => localGames.filter((g) => g.data?.id), [localGames]);
  const unmatchedGames = useMemo(() => localGames.filter((g) => !g.data?.id), [localGames]);

  const filteredLocalGames = useMemo(() => {
    let result = localGames;
    if (activeTab === 'matched') result = result.filter((g) => g.data?.id);
    if (activeTab === 'unmatched') result = result.filter((g) => !g.data?.id);
    if (localSearchQuery.trim()) {
      const q = localSearchQuery.toLowerCase();
      result = result.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.platform.toLowerCase().includes(q) ||
          g.installDir.toLowerCase().includes(q),
      );
    }
    return result;
  }, [localGames, activeTab, localSearchQuery]);

  // ── Shelves ───────────────────────────────────────────────────────

  const { data: popularGames = [] } = usePopularGames();

  const shelves = useMemo(
    () => buildGameShelves(matchedGames, unmatchedGames, localGames, popularGames),
    [matchedGames, unmatchedGames, localGames, popularGames],
  );

  // ── Genres ────────────────────────────────────────────────────────

  const { data: genres = [] } = useGameGenres();

  // ── Actions ────────────────────────────────────────────────────────

  const selectGame = useCallback((id: string) => {
    setSelectedLocalId(id);
  }, []);

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
      // DB-change event triggers auto-refetch via subscribeToGameDbChanges
    } catch (err) {
      console.error('Rescan failed:', err);
    } finally {
      setScanning(false);
    }
  }, []);

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

  // Seed unseeded titles on mount (desktop-only, runs once)
  useEffect(() => {
    if (localGames.length === 0 || !hasDesktopAPI()) return;
    const unseeded = localGames.filter((g) => !g.data?.id && !g.matchSuggestion);
    if (unseeded.length === 0) return;
    const titles = [...new Set(unseeded.map((g) => g.title))];
    seedMutation.mutate(titles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localGames.length]);

  // ── Return ─────────────────────────────────────────────────────────

  return {
    localGames,
    filteredLocalGames,
    selectedLocalGame,
    matchedGames,
    unmatchedGames,

    gameDetail,

    shelves,
    genres,

    sidePanelOpen,
    activeTab,
    localSearchQuery,
    scanning,

    matchedCount: matchedGames.length,
    unmatchedCount: unmatchedGames.length,
    suggestionCount: localGames.filter((g) => g.matchSuggestion).length,

    selectGame,
    setSidePanelOpen,
    setActiveTab,
    setLocalSearchQuery,
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleRescan,
    handlePlay,
    handleOpenFolder,
  };
}
