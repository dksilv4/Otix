import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@auth/hooks/use-auth'
import { Bookmark, ImageOff, Info, Loader2, Monitor, Moon, Scissors, ShieldAlert, Sun, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mediaQueries } from '../../queries/media-queries'
import { useToast } from '@ui/molecules/toast'
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
import { useMirroring, useSetMirroring } from '@/features/media/hooks/use-media-admin-settings'

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

function labelFor(typeOrAssetType: string): string {
  return (
    ARTWORK_GROUPS.find((g) => g.value === typeOrAssetType)?.label ??
    ASSET_TYPE_LABELS[typeOrAssetType] ??
    typeOrAssetType
  )
}

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

function PreviewImage({ asset }: { asset: MediaAsset }) {
  const [isLoading, setIsLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const ratio = aspectRatioOf(asset)

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
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
          'block h-auto w-auto max-w-full max-h-full object-contain',
          'transition-opacity duration-300',
          isLoading ? 'opacity-0' : 'opacity-100',
        )}
        onLoad={() => setIsLoading(false)}
        onError={() => setFailed(true)}
      />
    </>
  )
}

function AdminDenied({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-foreground">Admin access required</h3>
      <p className="max-w-sm text-xs text-muted-foreground">Only admins can choose artwork for a media item.</p>
      <button
        type="button"
        onClick={onClose}
        className="mt-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15 transition-colors"
      >
        Close
      </button>
    </div>
  )
}

export interface MediaManageModalProps {
  open?: boolean
  isExiting?: boolean
  onClose: () => void
  mediaType: string
  mediaId: string
}

export function MediaManageModal({ open, isExiting, onClose, mediaType, mediaId }: MediaManageModalProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const mirroring = useMirroring(Boolean(user?.isAdmin))
  const setMirroring = useSetMirroring()
  const { data: detail } = useQuery(mediaQueries.detail(mediaType, mediaId))
  const effectiveMediaId = detail?.id ? String(detail.id) : mediaId
  const { data: assetData, isLoading } = useMediaAssets(mediaType, effectiveMediaId)
  const selection = useSetArtworkSelection(mediaType, effectiveMediaId)
  const mirrorKeep = useSetAssetMirrorKeep(mediaType, effectiveMediaId)
  const textlessPick = useSetTextlessPick(mediaType, effectiveMediaId)

  const [animateIn, setAnimateIn] = useState(false)
  const [type, setType] = useState('poster')
  const [lang, setLang] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  // Smooth entrance animation matching modal framework
  useEffect(() => {
    requestAnimationFrame(() => setAnimateIn(true))
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Prevent background body scroll when open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const visible = animateIn && !isExiting && open !== false

  if (open === false) return null

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

  const visibleAssets = lang ? typeAssets.filter((a) => a.lang === lang) : typeAssets

  const autoActive = visibleAssets.find((a) => a.currentContexts.includes('general')) ?? visibleAssets[0]
  const activeAsset = visibleAssets.find((a) => a.id === activeId) ?? autoActive ?? null

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
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || err?.message
      toast({
        title: 'Failed to update the downloader',
        description: typeof msg === 'string' ? msg : undefined,
        variant: 'error',
      })
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
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || err?.message
      toast({
        title: 'Failed to update artwork',
        description: typeof msg === 'string' ? msg : undefined,
        variant: 'error',
      })
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
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || err?.message
      toast({
        title: 'Failed to update the textless pick',
        description: typeof msg === 'string' ? msg : undefined,
        variant: 'error',
      })
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
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || err?.message
      toast({
        title: 'Failed to update the mirror set',
        description: typeof msg === 'string' ? msg : undefined,
        variant: 'error',
      })
    }
  }

  const busyPinCtx =
    selection.isPending && selection.variables?.assetId === activeAsset?.id
      ? (selection.variables.context ?? activeAsset?.selectedContext)
      : null
  const pinBusyForActive = selection.isPending && selection.variables?.assetId === activeAsset?.id
  const textlessBusy =
    activeAsset != null && textlessPick.isPending && textlessPick.variables?.assetId === activeAsset.id
  const keepBusy = activeAsset != null && mirrorKeep.isPending && mirrorKeep.variables?.assetId === activeAsset.id

  return (
    <div
      className={cn(
        'fixed inset-0 z-[var(--dk-z-modal)] flex items-center justify-center p-4 transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Manage Artwork"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-md transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Dialog Panel: Fixed width and height across all tabs and empty states */}
      <div
        className={cn(
          'relative w-full max-w-5xl h-[86vh] min-h-[580px] max-h-[840px] flex flex-col rounded-3xl p-5 sm:p-6 backdrop-blur-3xl text-white transition-all duration-200 ease-out overflow-hidden',
          visible ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-4 opacity-0',
        )}
        style={{
          backgroundColor: 'oklch(from var(--dk-surface-base) l c h / 0.88)',
          boxShadow:
            'inset 0 1px 1px 0 rgba(255, 255, 255, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 30px 60px -12px rgba(0, 0, 0, 0.85)',
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.04] via-transparent to-black/[0.2]" />

        {!user?.isAdmin ? (
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <AdminDenied onClose={onClose} />
          </div>
        ) : (
          <div className="relative z-10 flex min-h-0 flex-1 flex-col space-y-4">
            {/* Header (fixed shrink-0) */}
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4 shrink-0">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Manage Artwork</p>
                <h2 className="truncate text-base sm:text-lg font-bold tracking-tight text-white">
                  {detail?.title ?? 'Loading…'}
                </h2>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowHelp((o) => !o)}
                  aria-expanded={showHelp}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-white hover:bg-white/5',
                    focusRing,
                  )}
                >
                  <Info className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">How this works</span>
                </button>

                <div className="flex items-center gap-2 border-l border-white/10 pl-2 sm:pl-3 text-xs sm:text-sm">
                  <span className="hidden text-xs text-muted-foreground min-[420px]:inline">Downloader</span>
                  <DkSwitch
                    checked={mirroringOn === true}
                    disabled={mirroringOn === null || mirrorBusy}
                    onCheckedChange={(next) => toggleMirroring(next)}
                  />
                </div>

                {/* Prominently aligned close button */}
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-xl p-2 text-white/50 transition-all hover:bg-white/10 hover:text-white cursor-pointer active:scale-95 ml-1"
                  aria-label="Close dialog"
                  title="Close dialog"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Help (inline, collapsible, shrink-0) */}
            {showHelp && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[12px] leading-relaxed text-muted-foreground shrink-0">
                <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <li className="flex items-start gap-2">
                    <Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      <strong className="text-white">General</strong>: fallback for Dark &amp; Light.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Moon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      <strong className="text-white">Dark / Light</strong>: overrides General for that theme.
                    </span>
                  </li>
                  {familyHasTextless && (
                    <li className="flex items-start gap-2">
                      <Scissors className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                      <span>
                        <strong className="text-white">Textless</strong>: marks one shared textless image.
                      </span>
                    </li>
                  )}
                  <li className="flex items-start gap-2">
                    <Bookmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      <strong className="text-white">Keep</strong>: downloads variant to disk even when unpicked.
                    </span>
                  </li>
                </ul>
              </div>
            )}

            {/* Family tabs + language (shrink-0) */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 shrink-0">
              <nav role="tablist" aria-label="Artwork type" className="flex items-center gap-1">
                {ARTWORK_GROUPS.map((g) => {
                  const active = type === g.value
                  return (
                    <button
                      key={g.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => chooseType(g.value)}
                      className={cn(
                        'relative rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors',
                        focusRing,
                        active ? 'text-white font-semibold' : 'text-muted-foreground hover:text-white',
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
                        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" aria-hidden="true" />
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
                      'rounded-md px-2 py-0.5 text-xs transition-colors',
                      focusRing,
                      lang === null
                        ? 'bg-primary/10 font-semibold text-primary'
                        : 'text-muted-foreground hover:text-white',
                    )}
                  >
                    All
                  </button>
                  {langOptions.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLang(l)}
                      aria-pressed={lang === l}
                      className={cn(
                        'rounded-md px-2 py-0.5 text-xs uppercase transition-colors',
                        focusRing,
                        lang === l
                          ? 'bg-primary/10 font-semibold text-primary'
                          : 'text-muted-foreground hover:text-white',
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Modal body (fills remaining space consistently) */}
            <div className="flex-1 min-h-0 flex flex-col">
              {isLoading ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
                  <span className="text-sm">Loading artwork…</span>
                </div>
              ) : typeAssets.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center text-center p-6">
                  <ImageOff className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold text-white">No {labelFor(type).toLowerCase()} images</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                    This provider hasn't supplied any{' '}
                    {selectedGroup.assetTypes.map((t) => labelFor(t).toLowerCase()).join(' & ')}.
                  </p>
                </div>
              ) : lang && visibleAssets.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center text-center p-6">
                  <p className="text-sm font-semibold text-white">No {lang.toUpperCase()} images</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                    No {selectedGroup.assetTypes.map((t) => labelFor(t).toLowerCase()).join(' & ')} in this language — switch
                    back to All.
                  </p>
                </div>
              ) : activeAsset ? (
                <div className="grid h-full min-h-0 gap-6 md:grid-cols-[minmax(0,1fr)_280px] lg:grid-cols-[minmax(0,1fr)_320px]">
                  {/* Left: Active Preview + Controls */}
                  <section aria-label="Selected artwork" className="flex flex-col min-h-0 justify-between gap-3 overflow-y-auto pr-1">
                    {/* Consistent-height preview box */}
                    <div className="flex h-[280px] sm:h-[320px] w-full items-center justify-center rounded-2xl border border-white/10 bg-black/30 p-2.5 relative overflow-hidden shrink-0">
                      <PreviewImage key={activeAsset.url} asset={activeAsset} />
                      {activeAsset.isTextless && (
                        <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground shadow-sm">
                          <Scissors className="h-3 w-3" /> Textless
                        </span>
                      )}
                      {activeAsset.selectedContext && (
                        <span className="absolute right-2.5 top-2.5 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-sm">
                          {CONTEXT_META[activeAsset.selectedContext].label}
                        </span>
                      )}
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col gap-2.5 shrink-0">
                      <div>
                        <p className="text-xs font-semibold text-white">Pin this image for</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {labelFor(activeAsset.assetType)} · {activeAsset.provider ?? 'unknown'}
                          {activeAsset.lang ? ` · ${activeAsset.lang.toUpperCase()}` : ''}
                          {activeAsset.score != null ? ` · ★${activeAsset.score}` : ''}
                          {activeAsset.localName ? ' · downloaded' : ''}
                        </p>
                      </div>

                      <div
                        className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-white/10 p-1"
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
                                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                                focusRing,
                                busy || active
                                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                  : 'text-muted-foreground hover:bg-white/5 hover:text-white',
                                pinBusyForActive && !busy && !active && 'opacity-50',
                              )}
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                              {CONTEXT_META[c].label}
                            </button>
                          )
                        })}
                        {familyHasTextless && (
                          <>
                            <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-white/10" />
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
                                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                                focusRing,
                                activeAsset.isTextless
                                  ? 'bg-accent text-accent-foreground hover:bg-accent/90'
                                  : 'text-muted-foreground hover:bg-white/5 hover:text-white',
                              )}
                            >
                              {textlessBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />}
                              <span>Textless</span>
                            </button>
                          </>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-0.5">
                        <p className="text-[11px] leading-tight text-muted-foreground max-w-sm">
                          Tap a theme to pin this image; tap again to unpin. Unpinned themes use the automatic best image (marked with a dot).
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
                            'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-white transition-colors',
                            focusRing,
                            activeAsset.keepLocal ? 'bg-primary/20 text-primary border-primary/40' : 'hover:bg-white/5',
                          )}
                        >
                          {keepBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Bookmark className={cn('h-3.5 w-3.5', activeAsset.keepLocal && 'fill-current text-primary')} />
                          )}
                          {activeAsset.keepLocal ? 'Kept on disk' : 'Keep on disk'}
                        </button>
                      </div>
                    </div>
                  </section>

                  {/* Right: Candidate List (scrollable) */}
                  <aside aria-label="Choose an image" className="flex flex-col h-full min-h-0 md:border-l md:border-white/10 md:pl-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0 pb-1.5">
                      Candidates ({visibleAssets.length})
                    </p>
                    <ul className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-1.5">
                      {visibleAssets.filter(Boolean).map((asset) => {
                        const isActive = asset.id === activeAsset.id
                        const portraitThumb = PORTRAIT.has(asset.assetType)
                        return (
                          <li key={asset.id}>
                            <button
                              type="button"
                              onClick={() => setActiveId(asset.id)}
                              aria-pressed={isActive}
                              className={cn(
                                'flex w-full items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left transition-colors',
                                focusRing,
                                isActive
                                  ? 'border-primary/50 bg-primary/10'
                                  : 'border-transparent hover:border-white/10 hover:bg-white/5',
                              )}
                            >
                              <Image
                                src={asset.url}
                                alt=""
                                loading="lazy"
                                className={cn(
                                  'block w-10 shrink-0 rounded-md border border-white/10 bg-white/5',
                                  portraitThumb ? 'aspect-[2/3]' : 'aspect-video',
                                )}
                                imgClassName={asset.assetType === 'logo' ? 'object-contain p-0.5' : undefined}
                              />
                              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="flex items-center gap-1.5 text-xs font-medium text-white">
                                  <span className="truncate">{asset.provider ?? 'Unknown'}</span>
                                  {asset.lang ? <span className="uppercase text-[10px] text-muted-foreground">{asset.lang}</span> : null}
                                  {asset.selectedContext ? (
                                    <span className="rounded bg-primary/20 px-1 text-[10px] font-semibold text-primary">
                                      {CONTEXT_META[asset.selectedContext].label}
                                    </span>
                                  ) : (
                                    asset.currentContexts.length > 0 && <Dot className="ml-auto bg-primary" />
                                  )}
                                </span>
                                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                  <span>{labelFor(asset.assetType)}</span>
                                  {asset.score != null ? <span>★{asset.score}</span> : null}
                                  {asset.isTextless && (
                                    <span className="flex items-center gap-0.5 text-accent">
                                      <Scissors className="h-2.5 w-2.5" /> textless
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
          </div>
        )}
      </div>
    </div>
  )
}
