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

      return games.map((game) => {
        const match = matchMap.get(game.title);
        if (match && match.matchedMedia) {
          return {
            ...game,
            otixMediaId: match.matchedMedia.id,
            otixMediaTitle: match.matchedMedia.title,
            otixMediaSlug: match.matchedMedia.slug,
            otixConfidence: match.confidence,
          };
        }
        return game;
      });
    },
  });
}
