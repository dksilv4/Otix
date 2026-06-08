// frontend/src/features/game-scanner/queries.ts
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { LocalGame } from "./types";

interface MatchResult {
  queryTitle: string;
  matchedMedia: {
    id: string;
    title: string;
    slug: string;
    posterUrl?: string | null;
    textlessPosterUrl?: string | null;
    backdropUrl?: string | null;
    logoUrl?: string | null;
    iconUrl?: string | null;
  } | null;
  confidence: number;
}

interface MatchResponse {
  matches: MatchResult[];
}

export function useSyncLocalGames() {
  return useMutation({
    mutationFn: async (games: LocalGame[]): Promise<void> => {
      const matched = games.filter((g) => g.data?.id);
      if (matched.length === 0) return;
      await apiClient.post("/media/sync-local-games", {
        games: matched.map((g) => ({
          id: g.id,
          mediaId: g.data?.id,
          title: g.title,
          platform: g.platform,
          exePath: g.exePath,
          installDir: g.installDir,
        })),
      });
    },
  });
}

export function useMatchLocalGames() {
  return useMutation({
    mutationFn: async (games: LocalGame[]): Promise<LocalGame[]> => {
      // Always send all game to refresh catalog data for every title
      const gameEntries = games.map((g) => ({
        title: g.title,
        platform: g.platform,
      }));
      const { data } = await apiClient.post<MatchResponse>(
        "/media/match-local-games",
        { games: gameEntries },
      );

      const matchMap = new Map(
        data.matches.map((m) => [m.queryTitle, m]),
      );

      return games.map((game) => {
        const match = matchMap.get(game.title);
        if (match && match.matchedMedia) {
          const media = match.matchedMedia;
          const isNewMatch = !game.data?.id;
          const autoAcceptNew = match.confidence >= 0.9;

          // Always refresh data for already-matched game, only auto-match new ones at high confidence
          if (game.data?.id || autoAcceptNew) {
            return {
              ...game,
              otixMediaId: media.id,
              otixMediaTitle: media.title,
              otixMediaSlug: media.slug,
              otixConfidence: match.confidence,
              otixPosterUrl: media.posterUrl,
              otixTextlessPosterUrl: media.textlessPosterUrl,
              otixBackdropUrl: media.backdropUrl,
              otixIconUrl: media.iconUrl,
              otixLogoUrl: media.logoUrl,
            };
          }
          // Medium confidence — show as recommendation for new matches
          return {
            ...game,
            otixConfidence: match.confidence,
            otixPosterUrl: media.posterUrl,
            otixTextlessPosterUrl: media.textlessPosterUrl,
            otixBackdropUrl: media.backdropUrl,
            otixIconUrl: media.iconUrl,
            otixLogoUrl: media.logoUrl,
            otixMatchSuggestion: {
              mediaId: media.id,
              title: media.title,
              slug: media.slug,
            },
          };
        }
        return game;
      });
    },
  });
}
