// frontend/src/features/game-scanner/queries.ts
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { DetectedGame } from "./types";

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

export function useMatchLocalGames() {
  return useMutation({
    mutationFn: async (games: DetectedGame[]): Promise<DetectedGame[]> => {
      // Always send all games to refresh catalog data for every title
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
          const isNewMatch = !game.otixMediaId;
          const autoAcceptNew = match.confidence >= 0.9;

          // Always refresh data for already-matched games, only auto-match new ones at high confidence
          if (game.otixMediaId || autoAcceptNew) {
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
