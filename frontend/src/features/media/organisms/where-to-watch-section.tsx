// TODO: Review this file
import { ExternalLink } from "lucide-react"
import { PlexIcon } from "@/features/dk-ui/atoms/plex-icon"
import type { MediaWatchProvider } from "@/features/media/media-queries"
import { cn } from "@/lib/utils"
import { API_BASE_URL } from "@/lib/api-client"
import "./where-to-watch-section.scss"

interface WhereToWatchSectionProps {
  watchProviders: MediaWatchProvider[]
  mediaType: string
}

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

function ProviderRow({ provider }: { provider: MediaWatchProvider }) {
  const isPlex = provider.watchProvider.slug === "plex"
  const hasUrl = !!provider.url

  let url = provider.url
  if (url && url.startsWith('/api/')) {
    const base = API_BASE_URL.endsWith('/api') ? API_BASE_URL.slice(0, -4) : API_BASE_URL
    url = `${base}${url}`
  }

  const inner = (
    <div
      className={cn(
        "dk-media-wtw__provider",
        hasUrl && "dk-media-wtw__provider--clickable",
      )}
    >
      {isPlex ? (
        <div className="dk-media-wtw__provider-icon dk-media-wtw__provider-icon--plex">
          <PlexIcon className="h-5 w-5" />
        </div>
      ) : provider.watchProvider.logoUrl ? (
        <img
          src={provider.watchProvider.logoUrl}
          alt=""
          className="dk-media-wtw__provider-logo"
        />
      ) : (
        <div className="dk-media-wtw__provider-fallback">
          {provider.watchProvider.name.slice(0, 2)}
        </div>
      )}
      <span className="dk-media-wtw__provider-name">{provider.watchProvider.name}</span>
      {hasUrl && <ExternalLink className="ml-auto h-3.5 w-3.5 opacity-40" />}
    </div>
  )

  if (hasUrl && url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
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
    <section className="dk-media-wtw">
      <h2 className="dk-media-wtw__title">Where to Watch</h2>

      <div className="dk-media-wtw__grid">
        {sections.map((section) => (
          <div key={section.key} className="dk-media-wtw__column">
            <h3 className={cn("dk-media-wtw__section-title", `dk-media-wtw__section-title--${section.colorMod}`)}>
              {section.label}
            </h3>
            <div className="dk-media-wtw__list">
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
