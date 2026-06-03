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
    logoUrl?: string | null;
  } | null;
  confidence: number;
}

interface MatchResponse {
  matches: MatchResult[];
}

export function useMatchLocalGames() {
  return useMutation({
    mutationFn: async (games: DetectedGame[]): Promise<DetectedGame[]> => {
      const unmatched = games.filter((g) => !g.otixMediaId);
      if (unmatched.length === 0) return games;

      const titles = unmatched.map((g) => g.title);
      const { data } = await apiClient.post<MatchResponse>(
        "/media/match-local-games",
        { titles },
      );

      const matchMap = new Map(
        data.matches.map((m) => [m.queryTitle, m]),
      );

      const AUTO_ACCEPT_THRESHOLD = 0.9;

      return games.map((game) => {
        const match = matchMap.get(game.title);
        if (match && match.matchedMedia) {
          const media = match.matchedMedia;
          if (match.confidence >= AUTO_ACCEPT_THRESHOLD) {
            return {
              ...game,
              otixMediaId: media.id,
              otixMediaTitle: media.title,
              otixMediaSlug: media.slug,
              otixConfidence: match.confidence,
              otixPosterUrl: media.posterUrl,
              otixTextlessPosterUrl: media.textlessPosterUrl,
              otixLogoUrl: media.logoUrl,
            };
          }
          // Medium confidence — show as recommendation, needs user confirmation
          return {
            ...game,
            otixConfidence: match.confidence,
            otixPosterUrl: media.posterUrl,
            otixTextlessPosterUrl: media.textlessPosterUrl,
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
