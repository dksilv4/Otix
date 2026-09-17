import { useState } from "react"
import { LayoutDashboardIcon } from "lucide-react"
import { useAuth } from "@/lib/providers/auth"
import { getConnectedPlatforms } from "../platforms"
import type { PlatformDefinition } from "../platforms"
import { LocalGamesOverviewSection } from "../molecules/local-games-overview-section"
import { ListsPreviewSection } from "../molecules/lists-preview-section"

// ── Expandable integration accordion ──

function IntegrationAccordion({ def }: { def: PlatformDefinition }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl overflow-hidden bg-[var(--dk-surface-glass)]/50">
      <def.OverviewModule expanded={open} onToggle={() => setOpen(!open)} />
    </div>
  )
}

// ── Overview page ──

export function LibraryOverviewPage() {
  const { user } = useAuth()
  const platforms = getConnectedPlatforms(user)

  return (
    <div className="space-y-8">
      <LocalGamesOverviewSection />
      <ListsPreviewSection />

      {platforms.length > 0 && (
        <div className="space-y-3">
          {platforms.map((def) => (
            <IntegrationAccordion key={def.id} def={def} />
          ))}
        </div>
      )}

      {platforms.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)] text-muted-foreground">
            <LayoutDashboardIcon className="h-6 w-6" />
          </div>
          <p className="text-lg font-semibold text-foreground">
            Your library overview
          </p>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            Connect platforms like Steam, Plex, or YouTube to see your library stats here. Browse tabs above
            to explore your collection.
          </p>
        </div>
      )}
    </div>
  )
}
