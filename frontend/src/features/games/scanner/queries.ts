import { useMutation } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type { DetectedGame } from "@/features/game-scanner/types"

export { useMatchLocalGames } from "@/features/game-scanner/queries"

export function useSyncLocalGames() {
  return useMutation({
    mutationFn: async (games: DetectedGame[]): Promise<void> => {
      const matched = games.filter((g) => g.otixMediaId)
      if (matched.length === 0) return
      await apiClient.post("/media/sync-local-games", {
        games: matched.map((g) => ({
          id: g.id,
          mediaId: g.otixMediaId,
          title: g.title,
          platform: g.platform,
          exePath: g.exePath,
          installDir: g.installDir,
        })),
      })
    },
  })
}
