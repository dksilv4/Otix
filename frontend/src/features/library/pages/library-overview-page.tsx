import { useState } from "react"
import { useAuth } from "@/lib/providers/auth"
import { getConnectedPlatforms } from "../platforms"
import type { PlatformDefinition } from "../platforms"
import { LibraryStatsPod } from "../molecules/library-stats-pod"
import { ContinueWatchingReel } from "../molecules/continue-watching-reel"
import { RecentlyWatchlistedReel } from "../molecules/recently-watchlisted-reel"
import { FavoritesReel } from "../molecules/favorites-reel"
import { LocalGamesOverviewSection } from "../molecules/local-games-overview-section"
import { ListsPreviewSection } from "../molecules/lists-preview-section"

// ── Expandable integration accordion ──

const IntegrationAccordion = ({ def }: { def: PlatformDefinition }) => {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-2xl overflow-hidden bg-[var(--dk-surface-glass)]/60 backdrop-blur-xl border border-white/[0.04]">
      <def.OverviewModule expanded={open} onToggle={() => setOpen(!open)} />
    </div>
  )
}

// ── Overview page ──

export const LibraryOverviewPage = () => {
  const { user } = useAuth()
  const platforms = getConnectedPlatforms(user)

  return (
    <div className="space-y-8">
      {/* 4-Stat Soft Glass Pod */}
      <LibraryStatsPod />

      {/* Actionable Reels */}
      <ContinueWatchingReel />
      <RecentlyWatchlistedReel />
      <FavoritesReel />

      {/* Games & Custom Lists */}
      <LocalGamesOverviewSection />
      <ListsPreviewSection />

      {/* Connected Platform Integrations */}
      {platforms.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Connected Platforms
          </h2>
          <div className="space-y-3">
            {platforms.map((def) => (
              <IntegrationAccordion key={def.id} def={def} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
