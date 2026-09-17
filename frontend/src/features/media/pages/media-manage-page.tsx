import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@auth/hooks/use-auth'
import { ArrowLeft, Bookmark, ImageOff, Info, Loader2, Monitor, Moon, Scissors, ShieldAlert, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mediaQueries, mediaTypeFromParam } from '@media'
import { useToast } from '@ui/molecules/toast'
import { DkButton } from '@ui/atoms/button'
import { DkSwitch } from '@ui/atoms/switch'
import { Image } from '@ui/atoms/image'
import { DkSkeleton } from '@ui/atoms/skeleton'
import {
  useMediaAssets,
  useSetArtworkSelection,
  useSetAssetMirrorKeep,
  useSetTextlessPick,
  type ArtworkContext,
  type MediaAsset,
} from '@/features/admin'
import { useMirroring, useSetMirroring } from '../hooks/use-media-admin-settings'

// Artwork is browsed by visual family. The Poster family shows every poster and
// textless-poster image together, the Backdrop family every backdrop (and any
// provider textless backdrop). One image is "active" at a time and its controls
// (per-theme pins + textless + keep) sit next to its large preview.
const ARTWORK_GROUPS: {
  value: string
  label: string
  assetTypes: string[]
  textless?: boolean
}[] = [
  { value: 'poster', label: 'Poster', assetTypes: ['poster', 'textless_poster'], textless: true },
  { value: 'backdrop', label: 'Backdrop', assetTypes: ['backdrop', 'textless_backdrop'], textless: true },
  { value: 'logo', label: 'Logo', assetTypes: ['logo'] },
  { value: 'icon', label: 'Icon', assetTypes: ['icon'] },
]

const ASSET_TYPE_LABELS: Record<string, string> = {
  poster: 'Poster',
  textless_poster: 'Textless poster',
  backdrop: 'Backdrop',
  textless_backdrop: 'Textless backdrop',
  logo: 'Logo',
  icon: 'Icon',
  screenshot: 'Screenshot',
}

const PORTRAIT = new Set(['poster', 'textless_poster', 'icon'])

const CONTEXTS: ArtworkContext[] = ['general', 'dark', 'light']

const CONTEXT_META: Record<ArtworkContext, { label: string; icon: typeof Sun; hint: string }> = {
  general: {
    label: 'General',
    icon: Monitor,
    hint: 'Served to every viewer, and the fallback for Dark and Light.',
  },
  dark: {
    label: 'Dark',
    icon: Moon,
    hint: 'Served in Dark mode; falls back to General when no Dark pick is set.',
  },
  light: {
    label: 'Light',
    icon: Sun,
    hint: 'Served in Light mode; falls back to General when no Light pick is set.',
  },
}

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-0'

function useMediaDetail(mediaType: string, id: string) {
  return useQuery(mediaQueries.detail(mediaType, id))
}

function labelFor(typeOrAssetType: string): string {
  return (
    ARTWORK_GROUPS.find((g) => g.value === typeOrAssetType)?.label ??
    ASSET_TYPE_LABELS[typeOrAssetType] ??
    typeOrAssetType
  )
}

/** True when this image reads as active for a context: explicit pin, or the
 *  automatic General image when no General pin is set. */
function isContextActive(asset: MediaAsset, context: ArtworkContext): boolean {
  if (asset.selectedContext === context) return true
  if (context === 'general' && asset.selectedContext == null && asset.currentContexts.includes('general')) {
    return true
  }
  return false
}

function Dot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('inline-block h-1.5 w-1.5 rounded-full', className)} />
}

function aspectRatioOf(asset: MediaAsset): string | undefined {
  const { width, height } = asset
  if (width && height && width > 0 && height > 0) return `${width} / ${height}`
  return undefined
}

/**
 * The active artwork preview. While an image loads a skeleton fills the box and
 * the image stays hidden, so a slow swap never shows the previous image. The
 * reserved ``aspect-ratio`` (from the asset's own dimensions) keeps the box a
 * stable size from the first frame instead of collapsing before the fetch.
 * Key by url in the parent so changing the pick resets the loading state.
 */
function PreviewImage({ asset }: { asset: MediaAsset }) {
  const [isLoading, setIsLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const ratio = aspectRatioOf(asset)

  if (failed) {
    return (
      <div className="flex min-h-[220px] w-full items-center justify-center text-muted-foreground">
        <ImageOff className="h-6 w-6" />
      </div>
    )
  }

  return (
    <>
      {isLoading && <DkSkeleton className="absolute inset-0 rounded-none" />}
      <img
        src={asset.url}
        alt=""
        style={ratio ? { aspectRatio: ratio } : undefined}
        className={cn(
          'block h-auto w-auto max-w-full max-h-[min(62vh,540px)] object-contain',
          'transition-opacity duration-300',
          isLoading ? 'opacity-0' : 'opacity-100',
        )}
        onLoad={() => setIsLoading(false)}
        onError={() => setFailed(true)}
      />
    </>
  )
}

// ── Admin gate ───────────────────────────────────────────────────────
function AdminDenied() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-semibold text-foreground">Admin access required</h1>
      <p className="max-w-sm text-sm text-muted-foreground">Only admins can choose artwork for a media item.</p>
    </div>
  )
}

// ── Editor ───────────────────────────────────────────────────────────
function ArtworkEditor({ mediaType, mediaId }: { mediaType: string; mediaId: string }) {
  const { toast } = useToast()
  const { user } = useAuth()
  const mirroring = useMirroring(Boolean(user?.isAdmin))
  const setMirroring = useSetMirroring()
  const { data: assetData, isLoading } = useMediaAssets(mediaType, mediaId)
  const selection = useSetArtworkSelection(mediaType, mediaId)
  const mirrorKeep = useSetAssetMirrorKeep(mediaType, mediaId)
  const textlessPick = useSetTextlessPick(mediaType, mediaId)
  const { data: detail } = useMediaDetail(mediaType, mediaId)

  const [type, setType] = useState('poster')
  const [lang, setLang] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  const assets = assetData?.items ?? []
  const selectedGroup = ARTWORK_GROUPS.find((g) => g.value === type) ?? ARTWORK_GROUPS[0]
  const familyHasTextless = selectedGroup.textless === true

  const mirroringOn = mirroring.isSuccess ? mirroring.data.enabled : null
  const mirrorBusy = setMirroring.isPending

  const counts: Record<string, number> = {}
  for (const a of assets) {
    const g = ARTWORK_GROUPS.find((grp) => grp.assetTypes.includes(a.assetType))
    if (g) counts[g.value] = (counts[g.value] ?? 0) + 1
  }

  const typeAssets = assets.filter((a) => selectedGroup.assetTypes.includes(a.assetType))
  const langSet = new Set<string>()
  for (const a of typeAssets) if (a.lang) langSet.add(a.lang)
  const langOptions = Array.from(langSet).sort()

  const visible = lang ? typeAssets.filter((a) => a.lang === lang) : typeAssets

  // The selected image, or (when the stored choice isn't in view) the image
  // currently serving General, else the first candidate.
  const autoActive = visible.find((a) => a.currentContexts.includes('general')) ?? visible[0]
  const activeAsset = visible.find((a) => a.id === activeId) ?? autoActive ?? null

  const chooseType = (value: string) => {
    setType(value)
    setLang(null)
  }

  const toggleMirroring = async (next: boolean) => {
    try {
      await setMirroring.mutateAsync(next)
      toast({
        title: next ? 'Downloader on' : 'Downloader off',
        description: next
          ? 'New picks are now mirrored as local copies.'
          : 'Choices are saved but images are no longer downloaded.',
        variant: 'success',
      })
    } catch {
      toast({ title: 'Failed to update the downloader', variant: 'error' })
    }
  }

  const pinActive = async (context: ArtworkContext) => {
    if (!activeAsset) return
    const clear = activeAsset.selectedContext === context
    try {
      await selection.mutateAsync({ assetId: activeAsset.id, context: clear ? null : context })
      toast({
        title: clear ? `${CONTEXT_META[context].label} pick cleared` : `Pinned for ${CONTEXT_META[context].label}`,
        description: clear
          ? `Using the automatic ${labelFor(activeAsset.assetType).toLowerCase()} again.`
          : `This image is now the ${CONTEXT_META[context].label.toLowerCase()} ${labelFor(activeAsset.assetType).toLowerCase()}.`,
        variant: 'success',
      })
    } catch {
      toast({ title: 'Failed to update artwork', variant: 'error' })
    }
  }

  const toggleTextlessActive = async () => {
    if (!activeAsset) return
    const active = !activeAsset.isTextless
    try {
      await textlessPick.mutateAsync({ assetId: activeAsset.id, active })
      toast({
        title: active ? 'Set as the textless image' : 'Textless pick cleared',
        description: active
          ? 'This image is now the textless art shared by General, Dark and Light.'
          : 'Using the automatic best textless image again.',
        variant: 'success',
      })
    } catch {
      toast({ title: 'Failed to update the textless pick', variant: 'error' })
    }
  }

  const toggleKeepActive = async () => {
    if (!activeAsset) return
    const keep = !activeAsset.keepLocal
    try {
      await mirrorKeep.mutateAsync({ assetId: activeAsset.id, keep })
      toast({
        title: keep ? 'Kept this variant mirrored' : 'Removed from the keep set',
        description: keep
          ? 'This image stays on disk even though it is not the chosen one.'
          : 'Its local copy will be freed if it is not a chosen image.',
        variant: 'success',
      })
    } catch {
      toast({ title: 'Failed to update the mirror set', variant: 'error' })
    }
  }

  const busyPinCtx =
    selection.isPending && selection.variables?.assetId === activeAsset?.id
      ? (selection.variables.context ?? activeAsset.selectedContext)
      : null
  const pinBusyForActive = selection.isPending && selection.variables?.assetId === activeAsset?.id
  const textlessBusy =
    activeAsset != null && textlessPick.isPending && textlessPick.variables?.assetId === activeAsset.id
  const keepBusy = activeAsset != null && mirrorKeep.isPending && mirrorKeep.variables?.assetId === activeAsset.id

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-6">
      {/* Flat header */}
      <header className="flex items-center gap-3 border-b border-border/60 py-4">
        <DkButton variant="ghost" size="icon" asChild aria-label="Back to media" title="Back to media">
          <Link to="/media/$mediaType/$mediaId" params={{ mediaType, mediaId }}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </DkButton>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Manage artwork</p>
          <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
            {detail?.title ?? 'Loading…'}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setShowHelp((o) => !o)}
          aria-expanded={showHelp}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
            focusRing,
          )}
        >
          <Info className="h-4 w-4" aria-hidden="true" />
          How this works
        </button>
        <div className="flex items-center gap-2 pl-1 text-sm">
          <span className="hidden text-sm text-muted-foreground min-[420px]:inline">Downloader</span>
          <DkSwitch
            checked={mirroringOn === true}
            disabled={mirroringOn === null || mirrorBusy}
            onCheckedChange={(next) => toggleMirroring(next)}
          />
        </div>
      </header>

      {/* Help (inline, collapsed) */}
      {showHelp && (
        <div className="border-b border-border/60 py-4">
          <ul className="grid gap-x-8 gap-y-2 text-[13px] leading-relaxed text-muted-foreground sm:grid-cols-2">
            <li className="flex items-start gap-2">
              <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <span className="font-medium text-foreground">General</span> is served to everyone and is the fallback
                for Dark and Light.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Moon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <span className="font-medium text-foreground">Dark / Light</span> picks override General for that theme.
                Unset themes use General, or the automatic best image.
              </span>
            </li>
            {familyHasTextless && (
              <li className="flex items-start gap-2">
                <Scissors className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <span>
                  <span className="font-medium text-foreground">Textless</span> marks one image as the family's
                  theme-agnostic textless art — a normal-looking poster/backdrop that is really textless can be picked
                  here.
                </span>
              </li>
            )}
            <li className="flex items-start gap-2">
              <Bookmark className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <span className="font-medium text-foreground">Keep</span> downloads a variant and keeps it on disk, e.g.
                localized posters. Kept copies survive re-picks.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Dot className="mt-1.5 bg-primary" />
              <span>
                <span className="font-medium text-foreground">In use</span> — a dot marks the image currently served for
                a theme.
              </span>
            </li>
          </ul>
        </div>
      )}

      {/* Family tabs + language */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
        <nav role="tablist" aria-label="Artwork type" className="flex items-center gap-1">
          {(Array.isArray(ARTWORK_GROUPS) ? ARTWORK_GROUPS : []).map((g) => {
            const active = type === g.value
            return (
              <button
                key={g.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => chooseType(g.value)}
                className={cn(
                  'relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  focusRing,
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {g.label}
                {counts[g.value] ? (
                  <span
                    className={cn('ml-1 text-xs tabular-nums', active ? 'text-primary' : 'text-muted-foreground/70')}
                  >
                    {counts[g.value]}
                  </span>
                ) : null}
                {active && (
                  <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" aria-hidden="true" />
                )}
              </button>
            )
          })}
        </nav>

        {langOptions.length > 1 && (
          <div role="group" aria-label="Filter artwork by language" className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setLang(null)}
              aria-pressed={lang === null}
              className={cn(
                'rounded-md px-2 py-1 text-xs transition-colors',
                focusRing,
                lang === null
                  ? 'bg-primary/10 font-semibold text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              All
            </button>
            {(Array.isArray(langOptions) ? langOptions : []).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={cn(
                  'rounded-md px-2 py-1 text-xs uppercase transition-colors',
                  focusRing,
                  lang === l
                    ? 'bg-primary/10 font-semibold text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Editor */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-24 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span className="text-sm">Loading artwork…</span>
        </div>
      ) : typeAssets.length === 0 ? (
        <div className="py-24 text-center">
          <ImageOff className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-foreground">No {labelFor(type).toLowerCase()} images</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This provider hasn't supplied any{' '}
            {selectedGroup.assetTypes.map((t) => labelFor(t).toLowerCase()).join(' & ')}.
          </p>
        </div>
      ) : lang && visible.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-sm font-medium text-foreground">No {lang.toUpperCase()} images</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No {selectedGroup.assetTypes.map((t) => labelFor(t).toLowerCase()).join(' & ')} in this language — switch
            back to All.
          </p>
        </div>
      ) : activeAsset ? (
        <div className="grid flex-1 gap-8 py-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Active preview + controls */}
          <section aria-label="Selected artwork" className="flex min-w-0 flex-col gap-5">
            <div className="flex w-full justify-center">
              <div
                className={cn(
                  'relative overflow-hidden rounded-xl border',
                  activeAsset.assetType === 'logo' && 'bg-card/60 p-4',
                  activeAsset.selectedContext || activeAsset.isTextless
                    ? 'border-primary/50'
                    : activeAsset.currentContexts.length
                      ? 'border-primary/30'
                      : 'border-border/70',
                )}
              >
                <PreviewImage key={activeAsset.url} asset={activeAsset} />
                {activeAsset.isTextless && (
                  <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground shadow-sm">
                    <Scissors className="h-3 w-3" /> Textless
                  </span>
                )}
                {activeAsset.selectedContext && (
                  <span className="absolute right-2 top-2 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-sm">
                    {CONTEXT_META[activeAsset.selectedContext].label}
                  </span>
                )}
              </div>
            </div>

            {/* Controls for the active image */}
            <div className="flex w-full min-w-0 flex-col gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Pin this image for</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {labelFor(activeAsset.assetType)} · {activeAsset.provider ?? 'unknown'}
                  {activeAsset.lang ? ` · ${activeAsset.lang.toUpperCase()}` : ''}
                  {activeAsset.score != null ? ` · ★${activeAsset.score}` : ''}
                  {activeAsset.localName ? ' · downloaded' : ''}
                </p>
              </div>

              <div
                className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-xl border border-border/70 p-0.5"
                role="group"
                aria-label="Pin the selected image for a theme"
              >
                {CONTEXTS.map((c) => {
                  const Icon = CONTEXT_META[c].icon
                  const active = isContextActive(activeAsset, c)
                  const busy = busyPinCtx === c
                  return (
                    <button
                      key={c}
                      type="button"
                      title={CONTEXT_META[c].hint}
                      aria-pressed={active}
                      aria-label={`Show in ${CONTEXT_META[c].label} theme`}
                      onClick={() => pinActive(c)}
                      disabled={pinBusyForActive}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        focusRing,
                        busy || active
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        pinBusyForActive && !busy && !active && 'opacity-50',
                      )}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                      {CONTEXT_META[c].label}
                    </button>
                  )
                })}
                {familyHasTextless && (
                  <>
                    <span aria-hidden="true" className="mx-1 h-5 w-px bg-border/70" />
                    <button
                      type="button"
                      onClick={() => toggleTextlessActive()}
                      disabled={pinBusyForActive}
                      title={
                        activeAsset.isTextless
                          ? 'This image is the textless art used by General, Dark and Light — click to clear'
                          : 'Use this image as the family textless art'
                      }
                      aria-pressed={activeAsset.isTextless}
                      aria-label={
                        activeAsset.isTextless ? 'Clear the textless pick' : 'Use as the family textless image'
                      }
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        focusRing,
                        activeAsset.isTextless
                          ? 'bg-accent text-accent-foreground hover:bg-accent/90'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {textlessBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                      <span className="hidden sm:inline">Textless</span>
                    </button>
                  </>
                )}
              </div>

              <p className="text-xs leading-relaxed text-muted-foreground">
                Tap a theme to pin this image to it; tap it again to unpin. When no theme is pinned, viewers get the
                automatic best image (marked with a dot).
              </p>

              <button
                type="button"
                onClick={() => toggleKeepActive()}
                disabled={keepBusy || mirroringOn === false}
                title={
                  mirroringOn === false
                    ? 'Turn the downloader on to keep local variants'
                    : activeAsset.keepLocal
                      ? 'Remove from the keep set'
                      : 'Keep this variant mirrored, even when not chosen'
                }
                aria-pressed={activeAsset.keepLocal}
                className={cn(
                  'inline-flex w-fit items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm font-medium text-foreground transition-colors',
                  focusRing,
                  activeAsset.keepLocal ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60',
                )}
              >
                {keepBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bookmark className={cn('h-4 w-4', activeAsset.keepLocal && 'fill-current text-primary')} />
                )}
                {activeAsset.keepLocal ? 'Kept on disk' : 'Keep on disk'}
              </button>
            </div>
          </section>

          {/* Candidate picker */}
          <aside aria-label="Choose an image" className="min-w-0 lg:border-l lg:border-border/60 lg:pl-6">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Choose an image</p>
            <ul className="mt-2 flex flex-col gap-1.5 lg:max-h-[65vh] lg:overflow-y-auto lg:pr-1">
              {(Array.isArray(visible) ? visible.filter(Boolean) : []).map((asset) => {
                const isActive = asset.id === activeAsset.id
                const portraitThumb = PORTRAIT.has(asset.assetType)
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(asset.id)}
                      aria-pressed={isActive}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border px-2 py-1.5 text-left transition-colors',
                        focusRing,
                        isActive
                          ? 'border-primary/50 bg-primary/5'
                          : 'border-transparent hover:border-border/70 hover:bg-muted/30',
                      )}
                    >
                      <Image
                        src={asset.url}
                        alt=""
                        loading="lazy"
                        className={cn(
                          'block w-11 shrink-0 rounded-md border border-border/60 bg-muted/30',
                          portraitThumb ? 'aspect-[2/3]' : 'aspect-video',
                        )}
                        imgClassName={asset.assetType === 'logo' ? 'object-contain p-0.5' : undefined}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                          {asset.provider ?? 'Unknown'}
                          {asset.lang ? <span className="uppercase text-muted-foreground">{asset.lang}</span> : null}
                          {asset.selectedContext ? (
                            <span className="rounded bg-primary/15 px-1 text-[10px] font-semibold text-primary">
                              {CONTEXT_META[asset.selectedContext].label}
                            </span>
                          ) : (
                            asset.currentContexts.length > 0 && <Dot className="ml-auto bg-primary" />
                          )}
                        </span>
                        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {labelFor(asset.assetType)}
                          {asset.score != null ? <span>★{asset.score}</span> : null}
                          {asset.isTextless && (
                            <span className="flex items-center gap-0.5 text-accent">
                              <Scissors className="h-3 w-3" /> textless
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>
        </div>
      ) : null}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────
export function MediaManagePage() {
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }
  const mediaType = mediaTypeFromParam(params.mediaType || 'movie')
  const mediaId = params.mediaId || ''
  const { user } = useAuth()

  if (!mediaId || !user?.isAdmin) return <AdminDenied />

  return <ArtworkEditor mediaType={mediaType} mediaId={mediaId} />
}
