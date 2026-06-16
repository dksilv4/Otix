import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Tv, X, ExternalLink } from "lucide-react"
import { mediaQueries, useMediaParams } from "@media"
import type { MediaWatchProvider } from "@media"
import { ProviderRow } from "./media-where-to-watch-provider-row"

const SECTION_CONFIG: Record<string, { label: string; types: string[] }> = {
  stream: {
    label: "Stream",
    types: ["flatrate", "free", "ads"],
  },
  rent: {
    label: "Rent",
    types: ["rent"],
  },
  buy: {
    label: "Buy",
    types: ["buy"],
  },
  personal: {
    label: "Your Library",
    types: ["personal"],
  },
}

const SECTION_COLOR: Record<string, string> = {
  stream: "text-emerald-400",
  rent: "text-amber-400",
  buy: "text-blue-400",
  personal: "text-[#e5a00d]",
}

const SECTION_ICON_BG: Record<string, string> = {
  stream: "bg-emerald-500/10",
  rent: "bg-amber-500/10",
  buy: "bg-blue-500/10",
  personal: "bg-[#e5a00d]/10",
}

function groupBySection(providers: MediaWatchProvider[]): Array<{ key: string; label: string; providers: MediaWatchProvider[] }> {
  const result: Array<{ key: string; label: string; providers: MediaWatchProvider[] }> = []
  for (const [key, config] of Object.entries(SECTION_CONFIG)) {
    const matched = providers.filter((p) => config.types.includes(p.offeringType))
    if (matched.length > 0) {
      result.push({ key, label: config.label, providers: matched })
    }
  }
  return result
}

/* ── Modal ── */

function WhereToWatchModal({
  providers,
  onClose,
}: {
  providers: MediaWatchProvider[]
  onClose: () => void
}) {
  const sections = groupBySection(providers)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", handler)
      document.body.style.overflow = ""
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[var(--dk-z-modal)] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Where to Watch"
        className="relative w-full max-w-md overflow-y-auto glass-card p-6 sm:p-8"
        style={{
          maxHeight: "85vh",
          animation: "authFormFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">
              <Tv className="h-5 w-5 text-white/70" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Where to Watch</h2>
              <p className="text-xs text-muted-foreground">
                {providers.length} provider{providers.length !== 1 ? "s" : ""} available
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-1.5 transition-all text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-[var(--foreground)]"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.key} className="glass-inset p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className={`h-1.5 w-1.5 rounded-full ${SECTION_COLOR[section.key]?.replace('text-', 'bg-')}`} />
                <h3 className={`text-xs font-semibold uppercase tracking-wider ${SECTION_COLOR[section.key]}`}>
                  {section.label}
                </h3>
              </div>
              <div className="space-y-0.5">
                {section.providers.map((p) => (
                  <ProviderRow key={p.id} provider={p} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Trigger Button ── */

export function WhereToWatchSection() {
  const [open, setOpen] = useState(false)
  const { mediaType, mediaId } = useMediaParams()

  const { data } = useQuery(mediaQueries.detail(mediaType, mediaId))
  if (!data || !data.watchProviders || data.watchProviders.length === 0) return null

  const watchProviders = data.watchProviders
  const displayType = data.mediaType
  if (!["movie", "show", "music"].includes(displayType)) return null

  const providerCount = watchProviders.length

  // Show up to 4 provider logos in the button preview
  const previewProviders = watchProviders
    .filter((p) => p.watchProvider.logoUrl)
    .slice(0, 4)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-card group flex w-full items-center gap-4 px-4 py-3 transition-all duration-200 hover:scale-[1.01]"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/60 group-hover:text-white/80 transition-colors">
          <Tv className="h-4.5 w-4.5" />
        </div>

        <div className="flex flex-1 items-center gap-3 min-w-0">
          <span className="text-sm font-semibold text-white/90">Where to Watch</span>

          {/* Stacked provider logo preview */}
          {previewProviders.length > 0 && (
            <div className="flex -space-x-2">
              {previewProviders.map((p) => (
                <img
                  key={p.id}
                  src={p.watchProvider.logoUrl!}
                  alt=""
                  className="h-6 w-6 rounded-md border-2 border-[var(--dk-surface-base)] object-contain"
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {providerCount}
          </span>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60" />
        </div>
      </button>

      {open && (
        <WhereToWatchModal
          providers={watchProviders}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
