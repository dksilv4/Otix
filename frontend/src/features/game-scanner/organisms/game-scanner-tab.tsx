import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Search, RefreshCw, Disc, Link2 } from "lucide-react";
import { GameGrid } from "../molecules/game-grid";
import { DirectoryManager } from "../molecules/directory-manager";
import { ScanProgress } from "../molecules/scan-progress";
import { PlatformFilter } from "../molecules/platform-filter";
import { EmptyState } from "../molecules/empty-state";
import { IsoInstallerModal } from "./iso-installer-modal";
import { IsoOrganizerModal } from "./iso-organizer-modal";
import { MatchGamesModal } from "./match-games-modal";
import { useMatchLocalGames } from "../queries";
import {
  getScanPaths,
  setScanPaths,
  getIsoPaths,
  setIsoPaths,
  getScannedGames,
  setScannedGames,
  setLocalGamesMapEntry,
  hasElectronAPI,
  mergeDuplicateGames,
} from "../storage";
import type { DetectedGame, Platform } from "../types";

export function GameScannerTab() {
  // Directories
  const [gamePaths, setGamePaths] = useState<string[]>(getScanPaths);
  const [isoPaths, setIsoPathsState] = useState<string[]>(getIsoPaths);

  // Games
  const [games, setGames] = useState<DetectedGame[]>(getScannedGames);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{
    currentDir: string;
    progress: number;
  } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<Platform>("all");

  // Modals
  const [installerOpen, setInstallerOpen] = useState(false);
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [matchModalOpen, setMatchModalOpen] = useState(false);

  // Mutations
  const matchMutation = useMatchLocalGames();

  // Persist directories to localStorage
  useEffect(() => {
    setScanPaths(gamePaths);
  }, [gamePaths]);

  useEffect(() => {
    setIsoPaths(isoPaths);
  }, [isoPaths]);

  // Persist games to localStorage and sync to electron game detector
  useEffect(() => {
    setScannedGames(games);
    // Populate local games map so media detail pages can find linked ISOs
    for (const game of games) {
      if (game.otixMediaId) {
        setLocalGamesMapEntry(game.otixMediaId, game);
      }
    }
    if (hasElectronAPI() && games.length > 0) {
      (window as any).electronAPI.setLibrary(games);
    }
  }, [games]);

  // Sync to electron on first mount for localStorage-restored games
  useEffect(() => {
    if (hasElectronAPI() && games.length > 0) {
      (window as any).electronAPI.setLibrary(games);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-match games that are matched but missing poster/logo art (from old scans)
  useEffect(() => {
    const needsArt = games.filter(
      (g) => g.otixMediaId && !g.otixPosterUrl && !g.otixLogoUrl,
    );
    if (needsArt.length === 0) return;

    // Temporarily clear otixMediaId so the mutation sends them to the API
    const stripped = needsArt.map((g) => ({
      ...g,
      otixMediaId: undefined as string | undefined,
    }));
    matchMutation.mutateAsync(stripped).then((updated) => {
      setGames((prev) => {
        const map = new Map(updated.map((g) => [g.id, g]));
        return prev.map((g) => map.get(g.id) ?? g);
      });
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Directory pickers
  const handleAddGameDir = useCallback(async () => {
    if (hasElectronAPI()) {
      try {
        const dir = await (window as any).electronAPI.selectDirectory();
        if (dir && !gamePaths.includes(dir)) {
          setGamePaths((prev) => [...prev, dir]);
        }
      } catch (err) {
        console.error("Failed to select directory:", err);
      }
    }
  }, [gamePaths]);

  const handleAddIsoDir = useCallback(async () => {
    if (hasElectronAPI()) {
      try {
        const dir = await (window as any).electronAPI.selectDirectory();
        if (dir && !isoPaths.includes(dir)) {
          setIsoPathsState((prev) => [...prev, dir]);
        }
      } catch (err) {
        console.error("Failed to select directory:", err);
      }
    }
  }, [isoPaths]);

  // Scan launcher libraries (Epic, GOG, Battle.net, etc.)
  const [scanningLaunchers, setScanningLaunchers] = useState(false);
  const handleScanLaunchers = useCallback(async () => {
    if (!hasElectronAPI()) return;

    setScanningLaunchers(true);
    try {
      const api = (window as any).electronAPI;
      const results = await api.scanLaunchers();
      const launcherGames: DetectedGame[] = [];
      for (const result of results) {
        launcherGames.push(...result.games);
      }

      if (launcherGames.length === 0) return;

      // Merge with existing games: keep directory-scanned games, add launcher games
      const existingIds = new Set(games.map((g) => g.id));
      const newGames = launcherGames.filter((g) => !existingIds.has(g.id));
      const merged = mergeDuplicateGames([...games, ...newGames]);

      // Match against Otix catalog
      if (merged.length > 0) {
        const matched = await matchMutation.mutateAsync(merged);
        setGames(matched);
      }
    } catch (err) {
      console.error('Launcher scan failed:', err);
    } finally {
      setScanningLaunchers(false);
    }
  }, [games, matchMutation]);

  // Ref to access latest games inside callbacks without stale closure
  const gamesRef = useRef(games);
  gamesRef.current = games;

  // Scan directories for games
  const handleScan = useCallback(async () => {
    if (gamePaths.length === 0 && isoPaths.length === 0) return;

    setScanning(true);
    setScanProgress({ currentDir: "Starting scan...", progress: 0 });

    try {
      let scannedGames: DetectedGame[] = [];

      if (hasElectronAPI()) {
        const api = (window as any).electronAPI;

        // Subscribe to progress
        const unsub = api.onScannerProgress(
          (evt: { currentDir: string; progress: number }) => {
            setScanProgress({
              currentDir: evt.currentDir,
              progress: evt.progress,
            });
          },
        );

        scannedGames = await api.scanPaths(gamePaths, isoPaths);
        unsub();
      }

      if (scannedGames.length > 0) {
        // Carry over otix data from previous scan for games the API can't match
        // (e.g. manually linked via SteamGridDB/IGDB — not in Otix catalog)
        const prevOtixMap = new Map<string, DetectedGame>();
        for (const g of gamesRef.current) {
          if (g.otixMediaId || g.otixMatchSuggestion) {
            prevOtixMap.set(g.id, g);
          }
        }

        const deduped = mergeDuplicateGames(scannedGames);
        const matched = await matchMutation.mutateAsync(deduped);

        const restored = matched.map((g) => {
          if (g.otixMediaId || g.otixMatchSuggestion) return g;
          const prev = prevOtixMap.get(g.id);
          if (!prev) return g;
          return {
            ...g,
            otixMediaId: prev.otixMediaId,
            otixMediaTitle: prev.otixMediaTitle,
            otixMediaSlug: prev.otixMediaSlug,
            otixConfidence: prev.otixConfidence,
            otixPosterUrl: prev.otixPosterUrl,
            otixTextlessPosterUrl: prev.otixTextlessPosterUrl,
            otixLogoUrl: prev.otixLogoUrl,
            otixMatchSuggestion: prev.otixMatchSuggestion,
          };
        });

        setGames(restored);
      } else {
        setGames([]);
      }
    } catch (err) {
      console.error("Scan failed:", err);
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  }, [gamePaths, isoPaths, matchMutation]);

  // Filtered games
  const filteredGames = useMemo(() => {
    let result = games;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.installDir.toLowerCase().includes(q),
      );
    }

    if (platformFilter !== "all") {
      result = result.filter((g) => g.platform === platformFilter);
    }

    return result;
  }, [games, searchQuery, platformFilter]);

  // Platform counts
  const platformCounts = useMemo(() => {
    const counts: Record<Platform, number> = {
      all: games.length,
      steam: 0,
      pc: 0,
      iso: 0,
      epic: 0,
      gog: 0,
      battlenet: 0,
      ubisoft: 0,
      ea: 0,
      riot: 0,
      xbox: 0,
      itch: 0,
    };
    for (const g of games) {
      if (counts[g.platform] !== undefined) {
        counts[g.platform]++;
      }
    }
    return counts;
  }, [games]);

  // Accept/reject match suggestions
  const handleAcceptSuggestion = useCallback((game: DetectedGame) => {
    setGames((prev) =>
      prev.map((g) =>
        g.id === game.id && game.otixMatchSuggestion
          ? {
              ...g,
              otixMediaId: game.otixMatchSuggestion.mediaId,
              otixMediaTitle: game.otixMatchSuggestion.title,
              otixMediaSlug: game.otixMatchSuggestion.slug,
              otixMatchSuggestion: undefined,
            }
          : g,
      ),
    );
  }, []);

  const handleRejectSuggestion = useCallback((game: DetectedGame) => {
    setGames((prev) =>
      prev.map((g) =>
        g.id === game.id
          ? {
              ...g,
              otixConfidence: undefined,
              otixMatchSuggestion: undefined,
            }
          : g,
      ),
    );
  }, []);

  // Clear filters
  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    setPlatformFilter("all");
  }, []);

  // Match modal link handler
  const handleLinkGame = useCallback(
    (gameId: string, mediaId: string, title: string, slug: string) => {
      setGames((prev) =>
        prev.map((g) =>
          g.id === gameId
            ? { ...g, otixMediaId: mediaId, otixMediaTitle: title, otixMediaSlug: slug, otixConfidence: 1, otixPosterUrl: g.otixPosterUrl, otixTextlessPosterUrl: g.otixTextlessPosterUrl, otixLogoUrl: g.otixLogoUrl, otixMatchSuggestion: undefined }
            : g,
        ),
      );
    },
    [],
  );

  const handleUnlinkGame = useCallback(
    (gameId: string) => {
      setGames((prev) =>
        prev.map((g) =>
          g.id === gameId
            ? {
                ...g,
                otixMediaId: undefined,
                otixMediaTitle: undefined,
                otixMediaSlug: undefined,
                otixConfidence: undefined,
                otixPosterUrl: undefined,
                otixTextlessPosterUrl: undefined,
                otixLogoUrl: undefined,
                otixMatchSuggestion: undefined,
              }
            : g,
        ),
      );
    },
    [],
  );

  // Determine what to render
  const hasDirs = gamePaths.length > 0 || isoPaths.length > 0;
  const hasGames = games.length > 0;
  const hasFilteredGames = filteredGames.length > 0;

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      {hasGames && !scanning && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-[var(--dk-surface-base)] px-5 py-3 shadow-[var(--dk-shadow-sm)]">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-lg font-bold tabular-nums">{games.length}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Games
              </p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold tabular-nums text-green-400">
                {games.filter((g) => g.otixMediaId).length}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Matched
              </p>
            </div>
            {games.filter((g) => g.otixMatchSuggestion).length > 0 && (
              <div className="text-center">
                <p className="text-lg font-bold tabular-nums text-blue-400">
                  {games.filter((g) => g.otixMatchSuggestion).length}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Suggested
                </p>
              </div>
            )}
            <div className="text-center">
              <p className="text-lg font-bold tabular-nums">
                {new Set(games.map((g) => g.platform)).size}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Platforms
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleScan}
              disabled={matchMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--dk-surface-glass)] px-4 py-2 text-sm font-semibold text-foreground backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] active:scale-[0.97] disabled:opacity-40"
            >
              <RefreshCw
                className={`h-4 w-4 ${matchMutation.isPending ? "animate-spin" : ""}`}
              />
              Scan Now
            </button>
            <button
              onClick={handleScanLaunchers}
              disabled={scanningLaunchers || matchMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--dk-surface-glass)] px-4 py-2 text-sm font-semibold text-foreground backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] active:scale-[0.97] disabled:opacity-40"
            >
              <RefreshCw
                className={`h-4 w-4 ${scanningLaunchers ? "animate-spin" : ""}`}
              />
              Scan Launchers
            </button>
            <button
              onClick={() => setMatchModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--dk-surface-glass)] px-4 py-2 text-sm font-semibold text-foreground backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] active:scale-[0.97]"
            >
              <Link2 className="h-4 w-4" />
              Match Games
            </button>
            <button
              onClick={() => setInstallerOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--dk-surface-glass)] px-4 py-2 text-sm font-semibold text-foreground backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] active:scale-[0.97]"
            >
              <Disc className="h-4 w-4" />
              Install ISO
            </button>
          </div>
        </div>
      )}

      {/* Directory manager */}
      <DirectoryManager
        gamePaths={gamePaths}
        isoPaths={isoPaths}
        onAddGameDir={handleAddGameDir}
        onRemoveGameDir={(p) => {
          setGamePaths((prev) => prev.filter((x) => x !== p));
          setGames((prev) => prev.filter((g) => !g.installDir.startsWith(p)));
        }}
        onAddIsoDir={handleAddIsoDir}
        onRemoveIsoDir={(p) => {
          setIsoPathsState((prev) => prev.filter((x) => x !== p));
        }}
      />

      {/* Scanning state */}
      {scanning && scanProgress && (
        <ScanProgress
          currentDir={scanProgress.currentDir}
          progress={scanProgress.progress}
          foundCount={games.length}
        />
      )}

      {/* No dirs yet */}
      {!scanning && !hasDirs && (
        <>
          <EmptyState
            variant="no-dirs"
            onAddGameDir={handleAddGameDir}
            onAddIsoDir={handleAddIsoDir}
          />
          <div className="flex justify-center mt-4">
            <button
              onClick={handleScanLaunchers}
              disabled={scanningLaunchers || matchMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] transition-all hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${scanningLaunchers ? "animate-spin" : ""}`} />
              Scan Installed Launchers
            </button>
          </div>
        </>
      )}

      {/* Has dirs but no games, show scan prompt */}
      {!scanning && hasDirs && !hasGames && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleScan}
              disabled={matchMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] transition-all hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
            >
              <RefreshCw
                className={`h-4 w-4 ${matchMutation.isPending ? "animate-spin" : ""}`}
              />
              Scan for Games
            </button>
            <button
              onClick={handleScanLaunchers}
              disabled={scanningLaunchers || matchMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--dk-surface-glass)] px-5 py-3 text-sm font-semibold text-foreground backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] active:scale-[0.97] disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${scanningLaunchers ? "animate-spin" : ""}`} />
              Scan Launchers
            </button>
          </div>
          <EmptyState variant="no-games" />
        </div>
      )}

      {/* Games found */}
      {!scanning && hasGames && (
        <>
          {/* Search + Filters */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <input
                type="text"
                placeholder="Search games..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 w-full rounded-xl bg-[var(--dk-surface-glass)] pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)] focus:ring-offset-1"
              />
            </div>
            <PlatformFilter
              value={platformFilter}
              onChange={setPlatformFilter}
              counts={platformCounts}
            />
          </div>

          {/* Game grid or no-results */}
          {hasFilteredGames ? (
            <GameGrid
              games={filteredGames}
              onAcceptSuggestion={handleAcceptSuggestion}
              onRejectSuggestion={handleRejectSuggestion}
            />
          ) : (
            <EmptyState
              variant="no-results"
              onClearFilters={handleClearFilters}
            />
          )}
        </>
      )}

      {/* Modals — imported from sibling files that will exist */}
      <MatchGamesModal
        open={matchModalOpen}
        onClose={() => setMatchModalOpen(false)}
        games={games}
        onLinkGame={handleLinkGame}
        onUnlinkGame={handleUnlinkGame}
      />

      <IsoInstallerModal
        open={installerOpen}
        onClose={() => setInstallerOpen(false)}
        games={games}
      />

      <IsoOrganizerModal
        open={organizerOpen}
        onClose={() => setOrganizerOpen(false)}
        isoPaths={isoPaths}
      />
    </div>
  );
}
