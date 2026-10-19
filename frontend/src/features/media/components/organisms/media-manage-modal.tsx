import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@auth/hooks/use-auth'
import { Bookmark, Check, ImageOff, Info, Loader2, Monitor, Moon, Scissors, ShieldAlert, X } from 'lucide-react'
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

import {
  ARTWORK_GROUPS,
  PORTRAIT,
  CONTEXTS,
  CONTEXT_META,
  labelFor,
  isContextActive,
  aspectRatioOf,
  focusRing,
} from '../../utils/manage'

const PreviewImage = ({ asset }: { asset: MediaAsset }) => {
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
};

const AdminDenied = ({ onClose }: { onClose: () => void }) => {
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
        className="mt-2 rounded-xl bg-[var(--dk-surface-glass)] px-4 py-2 text-xs font-semibold text-foreground hover:bg-[var(--dk-surface-glass-hover)] transition-colors"
      >
        Close
      </button>
    </div>
  )
};

export interface MediaManageModalProps {
  open?: boolean
  isExiting?: boolean
  onClose: () => void
  mediaType: string
  mediaId: string
}

export const MediaManageModal = ({ open, isExiting, onClose, mediaType, mediaId }: MediaManageModalProps) => {
  const { user } = useAuth()
  const { toast } = useToast()
  const mirroring = useMirroring(Boolean(user?.isAdmin))
  const setMirroring = useSetMirroring()

  const { data: detail } = useQuery(mediaQueries.detail(mediaType, mediaId))
  const [resolvedMediaId, setResolvedMediaId] = useState<string | null>(detail?.id ? String(detail.id) : null)
  useEffect(() => {
    if (detail?.id) {
      setResolvedMediaId(String(detail.id))
    }
  }, [detail?.id])
  const effectiveMediaId = resolvedMediaId ?? mediaId

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
  const activeAsset =
    (activeId != null ? visibleAssets.find((a) => String(a.id) === String(activeId)) : null) ??
    autoActive ??
    null

  const chooseType = (value: string) => {
    setType(value)
    setLang(null)
    setActiveId(null)
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
      await selection.mutateAsync({ assetId: String(activeAsset.id), context: clear ? null : context })
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
      await textlessPick.mutateAsync({ assetId: String(activeAsset.id), active })
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
      await mirrorKeep.mutateAsync({ assetId: String(activeAsset.id), keep })
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
    selection.isPending && String(selection.variables?.assetId) === String(activeAsset?.id)
      ? (selection.variables.context ?? activeAsset?.selectedContext)
      : null
  const pinBusyForActive =
    selection.isPending && String(selection.variables?.assetId) === String(activeAsset?.id)
  const textlessBusy =
    activeAsset != null &&
    textlessPick.isPending &&
    String(textlessPick.variables?.assetId) === String(activeAsset.id)
  const keepBusy =
    activeAsset != null &&
    mirrorKeep.isPending &&
    String(mirrorKeep.variables?.assetId) === String(activeAsset.id)

  const isGeneralActive = activeAsset != null && isContextActive(activeAsset, 'general')
  const isGeneralPinned = activeAsset?.selectedContext === 'general'

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
        className="absolute inset-0 bg-background/80 backdrop-blur-md transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Dialog Panel: Fixed width and height across all tabs and empty states */}
      <div
        className={cn(
          'relative w-full max-w-5xl h-[86vh] min-h-[580px] max-h-[840px] flex flex-col rounded-3xl p-5 sm:p-6 backdrop-blur-3xl text-foreground bg-[var(--dk-surface-base)]/95 border border-[var(--dk-separator)] shadow-2xl transition-all duration-200 ease-out overflow-hidden',
          visible ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-4 opacity-0',
        )}
      >
        {!user?.isAdmin ? (
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <AdminDenied onClose={onClose} />
          </div>
        ) : (
          <div className="relative z-10 flex min-h-0 flex-1 flex-col space-y-4">
            {/* Header (fixed shrink-0) */}
            <div className="flex items-center justify-between gap-3 border-b border-[var(--dk-separator)] pb-4 shrink-0">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Manage Artwork</p>
                <h2 className="truncate text-base sm:text-lg font-bold tracking-tight text-foreground">
                  {detail?.title ?? 'Loading…'}
                </h2>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowHelp((o) => !o)}
                  aria-expanded={showHelp}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-[var(--dk-surface-glass)]',
                    focusRing,
                  )}
                >
                  <Info className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">How this works</span>
                </button>

                <div className="flex items-center gap-2 border-l border-[var(--dk-separator)] pl-2 sm:pl-3 text-xs sm:text-sm">
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
                  className="shrink-0 rounded-xl p-2 text-muted-foreground transition-all hover:bg-[var(--dk-surface-glass)] hover:text-foreground cursor-pointer active:scale-95 ml-1"
                  aria-label="Close dialog"
                  title="Close dialog"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Help (inline, collapsible, shrink-0) */}
            {showHelp && (
              <div className="rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)] p-3 text-[12px] leading-relaxed text-muted-foreground shrink-0">
                <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <li className="flex items-start gap-2">
                    <Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      <strong className="text-foreground">General</strong>: fallback for Dark &amp; Light.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Moon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      <strong className="text-foreground">Dark / Light</strong>: overrides General for that theme.
                    </span>
                  </li>
                  {familyHasTextless && (
                    <li className="flex items-start gap-2">
                      <Scissors className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                      <span>
                        <strong className="text-foreground">Textless</strong>: marks one shared textless image.
                      </span>
                    </li>
                  )}
                  <li className="flex items-start gap-2">
                    <Bookmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      <strong className="text-foreground">Keep</strong>: downloads variant to disk even when unpicked.
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
                        active ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground',
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
                        : 'text-muted-foreground hover:text-foreground',
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
                          : 'text-muted-foreground hover:text-foreground',
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
                  <p className="mt-3 text-sm font-semibold text-foreground">No {labelFor(type).toLowerCase()} images</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                    This provider hasn't supplied any{' '}
                    {selectedGroup.assetTypes.map((t) => labelFor(t).toLowerCase()).join(' & ')}.
                  </p>
                </div>
              ) : lang && visibleAssets.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center text-center p-6">
                  <p className="text-sm font-semibold text-foreground">No {lang.toUpperCase()} images</p>
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
                    <div className="flex h-[280px] sm:h-[320px] w-full items-center justify-center rounded-2xl border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)] p-2.5 relative overflow-hidden shrink-0">
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
                    <div className="flex flex-col gap-3 shrink-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground">
                            {isGeneralPinned
                              ? `Pinned as Default ${selectedGroup.label}`
                              : isGeneralActive
                                ? `Active Default ${selectedGroup.label}`
                                : `Previewing Candidate ${selectedGroup.label}`}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                            {labelFor(activeAsset.assetType)} · {activeAsset.provider ?? 'unknown'}
                            {activeAsset.lang ? ` · ${activeAsset.lang.toUpperCase()}` : ''}
                            {activeAsset.score != null ? ` · ★${activeAsset.score}` : ''}
                            {activeAsset.localName ? ' · downloaded' : ''}
                          </p>
                        </div>

                        {/* Direct Select / Pin Button */}
                        {!isGeneralPinned ? (
                          <button
                            type="button"
                            onClick={() => pinActive('general')}
                            disabled={pinBusyForActive}
                            aria-label={`Set as ${selectedGroup.label}`}
                            className={cn(
                              'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all',
                              focusRing,
                              isGeneralActive
                                ? 'bg-primary/20 text-primary hover:bg-primary/30'
                                : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm active:scale-95',
                              pinBusyForActive && 'opacity-50 pointer-events-none',
                            )}
                          >
                            {busyPinCtx === 'general' ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            <span>{isGeneralActive ? 'Pin as Default' : `Set as ${selectedGroup.label}`}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => pinActive('general')}
                            disabled={pinBusyForActive}
                            aria-label="Clear pin and revert to automatic selection"
                            className={cn(
                              'inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/20 px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/30 active:scale-95',
                              focusRing,
                              pinBusyForActive && 'opacity-50 pointer-events-none',
                            )}
                          >
                            {busyPinCtx === 'general' ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            <span>Pinned</span>
                          </button>
                        )}
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground">Pin for theme</p>
                        <div
                          className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-[var(--dk-separator)] p-1"
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
                                    : 'text-muted-foreground hover:bg-[var(--dk-surface-glass)] hover:text-foreground',
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
                              <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-[var(--dk-separator)]" />
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
                                    : 'text-muted-foreground hover:bg-[var(--dk-surface-glass)] hover:text-foreground',
                                )}
                              >
                                {textlessBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />}
                                <span>Textless</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-0.5">
                        <p className="text-[11px] leading-tight text-muted-foreground max-w-sm">
                          Double-click a candidate or use the button to set as default. Theme buttons pin for specific modes.
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
                            'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--dk-separator)] px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors',
                            focusRing,
                            activeAsset.keepLocal ? 'bg-primary/20 text-primary border-primary/40' : 'hover:bg-[var(--dk-surface-glass)]',
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
                  <aside aria-label="Choose an image" className="flex flex-col h-full min-h-0 md:border-l md:border-[var(--dk-separator)] md:pl-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0 pb-1.5">
                      Candidates ({visibleAssets.length})
                    </p>
                    <ul className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-1.5">
                      {visibleAssets.filter(Boolean).map((asset) => {
                        const isActive = activeAsset != null && String(asset.id) === String(activeAsset.id)
                        const portraitThumb = PORTRAIT.has(asset.assetType)
                        const isPinned = asset.selectedContext != null
                        const isCurrentActive = asset.currentContexts.length > 0
                        return (
                          <li key={String(asset.id)}>
                            <button
                              type="button"
                              onClick={() => setActiveId(String(asset.id))}
                              onDoubleClick={() => {
                                setActiveId(String(asset.id))
                                void pinActive('general')
                              }}
                              aria-pressed={isActive}
                              className={cn(
                                'flex w-full items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left transition-colors',
                                focusRing,
                                isActive
                                  ? 'border-primary/50 bg-primary/10'
                                  : 'border-transparent hover:border-[var(--dk-separator)] hover:bg-[var(--dk-surface-glass)]',
                              )}
                            >
                              <Image
                                src={asset.url}
                                alt=""
                                loading="lazy"
                                className={cn(
                                  'block w-10 shrink-0 rounded-md border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)]',
                                  portraitThumb ? 'aspect-[2/3]' : 'aspect-video',
                                )}
                                imgClassName={asset.assetType === 'logo' ? 'object-contain p-0.5' : undefined}
                              />
                              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                                  <span className="truncate">{asset.provider ?? 'Unknown'}</span>
                                  {asset.lang ? <span className="uppercase text-[10px] text-muted-foreground">{asset.lang}</span> : null}
                                  {isPinned ? (
                                    <span className="ml-auto rounded bg-primary/20 px-1 text-[10px] font-semibold text-primary">
                                      {CONTEXT_META[asset.selectedContext!].label}
                                    </span>
                                  ) : isCurrentActive ? (
                                    <span className="ml-auto rounded bg-primary/15 px-1 text-[10px] font-medium text-primary">
                                      Active
                                    </span>
                                  ) : null}
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
};
