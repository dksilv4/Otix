import { useParams } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { mediaQueries, mediaTypeFromParam } from "@media"
import type { MediaWatchProvider } from "@media"
import { ProviderRow } from "./media-where-to-watch-provider-row"

const SECTION_CONFIG: Record<string, { label: string; colorMod: string; types: string[] }> = {
  stream: {
    label: "Stream",
    colorMod: "stream",
    types: ["flatrate", "free", "ads"],
  },
  rent: {
    label: "Rent",
    colorMod: "rent",
    types: ["rent"],
  },
  buy: {
    label: "Buy",
    colorMod: "buy",
    types: ["buy"],
  },
  personal: {
    label: "Your Library",
    colorMod: "personal",
    types: ["personal"],
  },
}

const SECTION_COLOR: Record<string, string> = {
  stream: "text-emerald-400",
  rent: "text-amber-400",
  buy: "text-blue-400",
  personal: "text-[#e5a00d]",
}

function groupBySection(providers: MediaWatchProvider[]): Array<{ key: string; label: string; colorMod: string; providers: MediaWatchProvider[] }> {
  const result: Array<{ key: string; label: string; colorMod: string; providers: MediaWatchProvider[] }> = []
  for (const [key, config] of Object.entries(SECTION_CONFIG)) {
    const matched = providers.filter((p) => config.types.includes(p.offeringType))
    if (matched.length > 0) {
      result.push({ key, label: config.label, colorMod: config.colorMod, providers: matched })
    }
  }
  return result
}

export function WhereToWatchSection() {
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }
  const mediaType = mediaTypeFromParam(params.mediaType || 'movie')
  const mediaId = params.mediaId || ''

  const { data } = useQuery(mediaQueries.detail(mediaType, mediaId))
  if (!data || !data.watchProviders || data.watchProviders.length === 0) return null

  const watchProviders = data.watchProviders
  const displayType = data.mediaType
  if (!["movie", "show", "music"].includes(displayType)) return null

  const sections = groupBySection(watchProviders)

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Where to Watch</h2>

      <div className="flex flex-wrap gap-4">
        {sections.map((section) => (
          <div key={section.key} className="glass-inset min-w-[140px] flex-1 space-y-2 p-4">
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${SECTION_COLOR[section.colorMod]}`}>
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
