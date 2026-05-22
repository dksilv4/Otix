import { useState, useMemo, useCallback } from 'react'
import { DkDialog } from '@/features/dk-ui/molecules/dialog'
import { useToast } from '@/features/dk-ui/molecules/toast'
import { useCreateProposal, useMediaAssets, ADMIN_XP, type ImageOverrideItem, type MediaAsset } from '../admin-edit-queries'
import type { MediaItemDetail } from '@/features/media/media-queries'
import { CropModal } from '@/features/settings/molecules/crop-modal'

import { apiClient } from '@/lib/api-client'
import { showXPToast } from '@/features/dk-ui/atoms/xp-toast'
import { Crop, Trash2, Check, Image, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const LANGUAGES: { code: string; label: string }[] = [
  { code: '*', label: 'All languages' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'th', label: 'Thai' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'tr', label: 'Turkish' },
  { code: 'pl', label: 'Polish' },
  { code: 'nl', label: 'Dutch' },
  { code: 'sv', label: 'Swedish' },
  { code: 'nb', label: 'Norwegian' },
  { code: 'fi', label: 'Finnish' },
]

const IMAGE_TYPES = [
  { value: 'poster', label: 'Poster' },
  { value: 'backdrop', label: 'Backdrop' },
  { value: 'logo', label: 'Logo' },
  { value: 'textless_poster', label: 'Textless Poster' },
]

type Tab = 'fields' | 'images' | 'preview'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mediaId: string
  media: MediaItemDetail
}

const IMAGE_TYPE_ALIASES: Record<string, string[]> = {
  poster: ['poster', 'icon'],
  backdrop: ['backdrop'],
  logo: ['logo'],
  textless_poster: ['textless_poster', 'poster', 'backdrop', 'icon'],
}

export function AdminEditModal({ open, onOpenChange, mediaId, media }: Props) {
  const { toast } = useToast()
  const createProposal = useCreateProposal(mediaId)
  const { data: assetData, isLoading: assetsLoading } = useMediaAssets(mediaId)
  const [tab, setTab] = useState<Tab>('fields')

  // Fields state
  const [title, setTitle] = useState(media.title)
  const [overview, setOverview] = useState(media.overview ?? '')
  const [tagline, setTagline] = useState(media.movie?.tagline ?? '')
  const [showStatus, setShowStatus] = useState(media.show?.status ?? '')
  const [releaseDate, setReleaseDate] = useState(media.releaseDate?.slice(0, 10) ?? '')
  const [originalLanguage, setOriginalLanguage] = useState(media.originalLanguage ?? '')

  // Image browser state
  const [browseType, setBrowseType] = useState('poster')
  const [browseLang, setBrowseLang] = useState('*')

  // Image overrides state: {imageType, languageCode, url, assetId?}
  const [imageOverrides, setImageOverrides] = useState<
    { imageType: string; languageCode: string; url: string; assetId?: string }[]
  >([])

  // Crop state — for cropping backdrops into textless posters
  const [cropAsset, setCropAsset] = useState<MediaAsset | null>(null)
  const [, setCropUploading] = useState(false)

  const needsCrop = (asset: MediaAsset) =>
    browseType === 'textless_poster' && asset.assetType === 'backdrop'

  const handleCropComplete = useCallback(
    async (blob: Blob) => {
      if (!cropAsset) return
      setCropUploading(true)
      try {
        const form = new FormData()
        form.append('file', blob, 'cropped-poster.webp')
        const { data } = await apiClient.post<{ url: string }>('/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        setImageOverrides((prev) => [
          ...prev.filter(
            (o) => !(o.imageType === browseType && o.languageCode === browseLang),
          ),
          { imageType: browseType, languageCode: browseLang, url: data.url },
        ])
        toast({ title: 'Cropped poster uploaded', variant: 'success' })
      } catch {
        toast({ title: 'Upload failed', variant: 'error' })
      } finally {
        setCropUploading(false)
        setCropAsset(null)
      }
    },
    [cropAsset, browseType, browseLang, toast],
  )

  // Filter assets by selected type
  const filteredAssets = useMemo(() => {
    if (!assetData?.items) return []
    const allowed = IMAGE_TYPE_ALIASES[browseType] ?? [browseType]
    return assetData.items.filter((a) => allowed.includes(a.assetType))
  }, [assetData, browseType])

  // Check if an asset URL is already selected as an override
  const isAssetSelected = (asset: MediaAsset) => {
    return imageOverrides.some(
      (o) => o.imageType === browseType && o.languageCode === browseLang && o.url === asset.url,
    )
  }

  const selectAsset = (asset: MediaAsset) => {
    if (isAssetSelected(asset)) return
    if (needsCrop(asset)) {
      setCropAsset(asset)
      return
    }
    setImageOverrides((prev) => [
      ...prev.filter(
        (o) => !(o.imageType === browseType && o.languageCode === browseLang),
      ),
      {
        imageType: browseType,
        languageCode: browseLang,
        url: asset.url,
        assetId: asset.id,
      },
    ])
  }

  const removeImageOverride = (index: number) => {
    setImageOverrides((prev) => prev.filter((_, i) => i !== index))
  }

  // Build changes object
  const changes = useMemo(() => {
    const c: Record<string, unknown> = {}
    if (title !== media.title) c.title = title
    if (overview !== (media.overview ?? '')) c.overview = overview || null
    if (media.movie && tagline !== (media.movie.tagline ?? '')) c.tagline = tagline || null
    if (media.show && showStatus !== (media.show.status ?? '')) c.status = showStatus || null
    if (releaseDate !== (media.releaseDate?.slice(0, 10) ?? ''))
      c.release_date = releaseDate || null
    if (originalLanguage !== (media.originalLanguage ?? ''))
      c.original_language = originalLanguage || null
    return c
  }, [title, overview, tagline, showStatus, releaseDate, originalLanguage, media])

  const hasChanges = Object.keys(changes).length > 0 || imageOverrides.length > 0

  const handleSubmit = async () => {
    if (!hasChanges) return
    try {
      await createProposal.mutateAsync({
        changes,
        imageOverrides:
          imageOverrides.length > 0
            ? (imageOverrides.map(({ imageType, languageCode, url }) => ({
                imageType,
                languageCode,
                url,
              })) as ImageOverrideItem[])
            : null,
      })
      showXPToast(ADMIN_XP.PROPOSAL_CREATE)
      toast({ title: 'Edit proposal submitted', variant: 'success' })
      onOpenChange(false)
    } catch {
      toast({ title: 'Failed to submit proposal', variant: 'error' })
    }
  }

  const handleOpen = (open: boolean) => {
    if (open) {
      setTitle(media.title)
      setOverview(media.overview ?? '')
      setTagline(media.movie?.tagline ?? '')
      setShowStatus(media.show?.status ?? '')
      setReleaseDate(media.releaseDate?.slice(0, 10) ?? '')
      setOriginalLanguage(media.originalLanguage ?? '')
      setImageOverrides([])
      setBrowseType('poster')
      setBrowseLang('*')
      setTab('fields')
    }
    onOpenChange(open)
  }

  const langLabel = (code: string) =>
    LANGUAGES.find((l) => l.code === code)?.label ?? code

  const typeLabel = (value: string) =>
    IMAGE_TYPES.find((t) => t.value === value)?.label ?? value

  return (
    <DkDialog
      open={open}
      onOpenChange={handleOpen}
      title="Edit Media"
      description="Propose changes to media data and localized images"
      className="max-w-2xl"
    >
      <div className="space-y-5">
        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-[var(--dk-surface-ghost)] p-1">
          {(['fields', 'images', 'preview'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors"
              style={{
                background: tab === t ? 'var(--dk-surface-base)' : 'transparent',
                color: tab === t ? 'var(--foreground)' : 'var(--muted-foreground)',
                boxShadow: tab === t ? 'var(--dk-shadow-sm)' : 'none',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Fields tab */}
        {tab === 'fields' && (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-[var(--dk-border)] bg-[var(--dk-surface-ghost)] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Overview</span>
              <textarea
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-[var(--dk-border)] bg-[var(--dk-surface-ghost)] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-vertical"
              />
            </label>
            {media.mediaType === 'movie' && (
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Tagline</span>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="w-full rounded-xl border border-[var(--dk-border)] bg-[var(--dk-surface-ghost)] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
            )}
            {media.mediaType === 'show' && (
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Status</span>
                <select
                  value={showStatus}
                  onChange={(e) => setShowStatus(e.target.value)}
                  className="w-full rounded-xl border border-[var(--dk-border)] bg-[var(--dk-surface-ghost)] px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">—</option>
                  <option value="returning_series">Returning Series</option>
                  <option value="ended">Ended</option>
                  <option value="canceled">Canceled</option>
                  <option value="in_production">In Production</option>
                  <option value="planned">Planned</option>
                  <option value="pilot">Pilot</option>
                </select>
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Release Date</span>
              <input
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                className="w-full rounded-xl border border-[var(--dk-border)] bg-[var(--dk-surface-ghost)] px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Original Language</span>
              <select
                value={originalLanguage}
                onChange={(e) => setOriginalLanguage(e.target.value)}
                className="w-full rounded-xl border border-[var(--dk-border)] bg-[var(--dk-surface-ghost)] px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">—</option>
                {LANGUAGES.filter((l) => l.code !== '*').map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Images tab — asset browser */}
        {tab === 'images' && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Browse existing media assets and select images per language.
              Selected overrides apply when users with matching language preferences view this page.
            </p>

            {/* Filter bar */}
            <div className="flex gap-2">
              <select
                value={browseType}
                onChange={(e) => setBrowseType(e.target.value)}
                className="rounded-xl border border-[var(--dk-border)] bg-[var(--dk-surface-ghost)] px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {IMAGE_TYPES.map((it) => (
                  <option key={it.value} value={it.value}>
                    {it.label}
                  </option>
                ))}
              </select>
              <select
                value={browseLang}
                onChange={(e) => setBrowseLang(e.target.value)}
                className="rounded-xl border border-[var(--dk-border)] bg-[var(--dk-surface-ghost)] px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Asset grid */}
            {assetsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Image className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No assets found for this type.</p>
                <p className="text-xs text-muted-foreground/60">
                  Try selecting a different image type.
                </p>
              </div>
            ) : (
              <div className="grid max-h-96 grid-cols-2 gap-2 overflow-y-auto pr-1">
                {filteredAssets.map((asset) => {
                  const selected = isAssetSelected(asset)
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => selectAsset(asset)}
                      disabled={selected}
                      className={cn(
                        'relative h-28 w-full overflow-hidden rounded-xl border-2 transition-all bg-black/20',
                        selected
                          ? 'border-primary ring-2 ring-primary/30'
                          : 'border-[var(--dk-border)] hover:border-primary/50',
                      )}
                    >
                      <img
                        src={asset.url}
                        alt=""
                        className="h-full w-full object-contain p-1"
                        loading="lazy"
                      />
                      {selected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-primary/30">
                          <Check className="h-6 w-6 text-white drop-shadow-lg" />
                        </div>
                      )}
                      {needsCrop(asset) && (
                        <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded-md bg-primary/80 px-1.5 py-0.5 text-[9px] font-medium text-white">
                          <Crop className="h-2.5 w-2.5" />
                          Crop
                        </span>
                      )}
                      {!needsCrop(asset) && asset.lang && (
                        <span className="absolute top-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white">
                          {asset.lang.toUpperCase()}
                        </span>
                      )}
                      {asset.provider && (
                        <span className="absolute bottom-1 right-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] text-white/70">
                          {asset.provider}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Selected overrides */}
            {imageOverrides.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Selected Overrides ({imageOverrides.length})
                </p>
                <div className="space-y-1.5">
                  {imageOverrides.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-xl border border-[var(--dk-border)] bg-[var(--dk-surface-ghost)] p-2"
                    >
                      <img
                        src={item.url}
                        alt=""
                        className="h-12 w-9 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground">
                          {typeLabel(item.imageType)}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {langLabel(item.languageCode)} · {item.url}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeImageOverride(i)}
                        className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Crop overlay — backdrop → textless poster */}
        {cropAsset && (
          <div className="fixed inset-0 z-[calc(var(--dk-z-modal)+1)] flex items-center justify-center bg-black/60">
            <CropModal
              imageUrl={cropAsset.url}
              shape="rect"
              aspect={2 / 3}
              outputSize={{ width: 600, height: 900 }}
              onComplete={handleCropComplete}
              onCancel={() => setCropAsset(null)}
            />
          </div>
        )}

        {/* Preview tab */}
        {tab === 'preview' && (
          <div className="space-y-3">
            {!hasChanges ? (
              <p className="text-center text-sm text-muted-foreground py-4">
                No changes to preview.
              </p>
            ) : (
              <>
                {Object.keys(changes).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Field Changes</p>
                    <div className="rounded-xl border border-[var(--dk-border)] bg-[var(--dk-surface-ghost)] p-3">
                      {Object.entries(changes).map(([field, value]) => (
                        <div key={field} className="flex gap-2 py-1 text-sm">
                          <span className="w-36 shrink-0 font-medium text-muted-foreground">
                            {field}
                          </span>
                          <span className="text-emerald-400">
                            {value === null ? '(clear)' : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {imageOverrides.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Image Overrides</p>
                    <div className="space-y-1.5">
                      {imageOverrides.map((item, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-xl border border-[var(--dk-border)] bg-[var(--dk-surface-ghost)] p-2">
                          <img
                            src={item.url}
                            alt=""
                            className="h-12 w-9 shrink-0 rounded-lg object-cover"
                          />
                          <div className="min-w-0 text-sm">
                            <span className="font-medium">
                              {typeLabel(item.imageType)}
                            </span>
                            <span className="text-muted-foreground">
                              {' '}· {langLabel(item.languageCode)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!hasChanges || createProposal.isPending}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-50 transition-opacity"
          >
            {createProposal.isPending ? 'Submitting...' : 'Submit Proposal'}
          </button>
        </div>
      </div>
    </DkDialog>
  )
}
