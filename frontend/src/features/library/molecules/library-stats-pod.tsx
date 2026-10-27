import { useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Bookmark, CheckCircle2, Heart, Gamepad2 } from "lucide-react"
import { useAuth } from "@/lib/providers/auth"
import { userQueries } from "@/features/user/user-queries"
import { useLibraryTab } from "../library-queries"
import { getConnectedPlatforms } from "../platforms"
import { useLocalGames } from "@/features/launcher/data/game-queries"

export const LibraryStatsPod = () => {
  const navigate = useNavigate()
  const { user } = useAuth()

  // Queries for stats
  const { data: watchlistData } = useLibraryTab("watchlist", { limit: "1" })
  const { data: watchedData } = useLibraryTab("watched", { limit: "1" })
  const { data: playedData } = useLibraryTab("played", { limit: "1" })
  const { data: likedData } = useLibraryTab("like", { limit: "1" })
  const { data: localGames = [] } = useLocalGames()
  const { data: statsData } = useQuery({
    ...userQueries.libraryStats(user?.username ?? ""),
    enabled: Boolean(user?.username),
  })

  const connectedPlatforms = useMemo(() => getConnectedPlatforms(user), [user])

  // Compute metrics
  const watchlistCount = useMemo(() => {
    const page = watchlistData?.pages?.[0]
    return page?.total ?? page?.items?.length ?? 0
  }, [watchlistData])

  const watchedPlayedCount = useMemo(() => {
    const watchedPage = watchedData?.pages?.[0]
    const playedPage = playedData?.pages?.[0]
    const wCount = watchedPage?.total ?? watchedPage?.items?.length ?? 0
    const pCount = playedPage?.total ?? playedPage?.items?.length ?? 0
    return wCount + pCount
  }, [watchedData, playedData])

  const favoritesCount = useMemo(() => {
    const page = likedData?.pages?.[0]
    return page?.total ?? page?.items?.length ?? 0
  }, [likedData])

  const gamesCount = Array.isArray(localGames) ? localGames.length : 0
  const platformsCount = connectedPlatforms.length
  const totalPlatformsGames = gamesCount + platformsCount

  const completionText = useMemo(() => {
    if (statsData?.completionRate != null && statsData.completionRate > 0) {
      return `${Math.round(statsData.completionRate * 100)}% completed`
    }
    return "Completed titles"
  }, [statsData])

  return (
    <div className="rounded-2xl bg-[var(--dk-surface-glass)]/60 backdrop-blur-xl p-4 sm:p-5 border border-white/[0.04] shadow-sm">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* Watchlist Pod */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate({ to: "/library/watchlist" })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") navigate({ to: "/library/watchlist" })
          }}
          className="group flex flex-col justify-between rounded-xl p-4 bg-[var(--dk-surface-glass)]/40 hover:bg-[var(--dk-surface-elevated)]/60 border border-white/[0.04] transition-all cursor-pointer text-left"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
              Watchlist
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform">
              <Bookmark className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
              {watchlistCount}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">Saved for later</p>
          </div>
        </div>

        {/* Watched & Played Pod */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate({ to: "/library/watched" })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") navigate({ to: "/library/watched" })
          }}
          className="group flex flex-col justify-between rounded-xl p-4 bg-[var(--dk-surface-glass)]/40 hover:bg-[var(--dk-surface-elevated)]/60 border border-white/[0.04] transition-all cursor-pointer text-left"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
              Watched & Played
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
              {watchedPlayedCount}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">{completionText}</p>
          </div>
        </div>

        {/* Favorites Pod */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate({ to: "/library/like" })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") navigate({ to: "/library/like" })
          }}
          className="group flex flex-col justify-between rounded-xl p-4 bg-[var(--dk-surface-glass)]/40 hover:bg-[var(--dk-surface-elevated)]/60 border border-white/[0.04] transition-all cursor-pointer text-left"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
              Favorites
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform">
              <Heart className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
              {favoritesCount}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">Liked titles</p>
          </div>
        </div>

        {/* Platforms & Local Games Pod */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate({ to: "/library/games" })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") navigate({ to: "/library/games" })
          }}
          className="group flex flex-col justify-between rounded-xl p-4 bg-[var(--dk-surface-glass)]/40 hover:bg-[var(--dk-surface-elevated)]/60 border border-white/[0.04] transition-all cursor-pointer text-left"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
              Platforms & Games
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform">
              <Gamepad2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
              {totalPlatformsGames}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">
              {platformsCount} connected • {gamesCount} games
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
