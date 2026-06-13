import { ExternalLink } from "lucide-react"
import { PlexIcon } from "@/old-features/dk-ui/atoms/plex-icon"
import type { MediaWatchProvider } from "@/old-features/media/media-queries"
import { cn } from "@/lib/utils"
import { API_BASE_URL } from "@/lib/api-client"

export function ProviderRow({ provider }: { provider: MediaWatchProvider }) {
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
        "flex items-center gap-3 rounded-xl px-3 py-2 transition-all duration-150",
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

  if (hasUrl && url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    )
  }

  return inner
}
