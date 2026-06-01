import { ExternalLink } from "lucide-react"
import { PlexIcon } from "@/features/dk-ui/atoms/plex-icon"
import type { MediaWatchProvider } from "@/features/media/media-queries"
import { cn } from "@/lib/utils"

interface WhereToWatchSectionProps {
  watchProviders: MediaWatchProvider[]
  mediaType: string
}

const SECTION_CONFIG: Record<string, { label: string; color: string; types: string[] }> = {
  stream: {
    label: "Stream",
    color: "text-emerald-400",
    types: ["flatrate", "free", "ads"],
  },
  rent: {
    label: "Rent",
    color: "text-amber-400",
    types: ["rent"],
  },
  buy: {
    label: "Buy",
    color: "text-blue-400",
    types: ["buy"],
  },
  personal: {
    label: "Your Library",
    color: "text-[#e5a00d]",
    types: ["personal"],
  },
}

function groupBySection(providers: MediaWatchProvider[]): Array<{ key: string; label: string; color: string; providers: MediaWatchProvider[] }> {
  const result: Array<{ key: string; label: string; color: string; providers: MediaWatchProvider[] }> = []
  for (const [key, config] of Object.entries(SECTION_CONFIG)) {
    const matched = providers.filter((p) => config.types.includes(p.offeringType))
    if (matched.length > 0) {
      result.push({ key, label: config.label, color: config.color, providers: matched })
    }
  }
  return result
}

function ProviderRow({ provider }: { provider: MediaWatchProvider }) {
  const isPlex = provider.watchProvider.slug === "plex"
  const hasUrl = !!provider.url

  const inner = (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 transition-colors",
        hasUrl && "cursor-pointer hover:bg-white/[0.04]",
      )}
    >
      {isPlex ? (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg text-[#e5a00d]">
          <PlexIcon className="h-5 w-5" />
        </div>
      ) : provider.watchProvider.logoUrl ? (
        <img
          src={provider.watchProvider.logoUrl}
          alt=""
          className="h-8 w-8 rounded-lg object-contain"
        />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-xs font-semibold text-muted-foreground">
          {provider.watchProvider.name.slice(0, 2)}
        </div>
      )}
      <span className="text-sm font-medium">{provider.watchProvider.name}</span>
      {hasUrl && <ExternalLink className="ml-auto h-3.5 w-3.5 opacity-40" />}
    </div>
  )

  if (hasUrl) {
    return (
      <a href={provider.url!} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    )
  }

  return inner
}

export function WhereToWatchSection({ watchProviders, mediaType }: WhereToWatchSectionProps) {
  if (!watchProviders || watchProviders.length === 0) return null

  if (!["movie", "show", "music"].includes(mediaType)) return null

  const sections = groupBySection(watchProviders)

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Where to Watch</h2>

      <div className="flex flex-wrap gap-4">
        {sections.map((section) => (
          <div key={section.key} className="min-w-[140px] flex-1 space-y-2">
            <h3 className={cn("text-xs font-semibold uppercase tracking-wider", section.color)}>
              {section.label}
            </h3>
            <div className="space-y-1">
              {section.providers.map((p) => (
                <ProviderRow key={p.id} provider={p} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
