import { useState, useMemo, useCallback } from 'react'
import { DkDialog } from '@/features/dk-ui/molecules/dialog'
import { DkInput } from '@/features/dk-ui/atoms/input'
import { DkTextarea } from '@/features/dk-ui/atoms/textarea'
import { DkSelect } from '@/features/dk-ui/atoms/select'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { DkTabs, DkTabList, DkTab, DkTabPanel } from '@/features/dk-ui/molecules/tabs'
import { useToast } from '@/features/dk-ui/molecules/toast'
import { useCreateProposal, useMediaAssets, ADMIN_XP, type ImageOverrideItem, type MediaAsset } from '../admin-edit-queries'
import type { MediaItemDetail } from '@/features/media/media-queries'
import { PositionModal } from '@/features/settings/molecules/position-modal'
import { encodePositionInUrl } from '@/lib/image-position'

import { showXPToast } from '@/features/dk-ui/atoms/xp-toast'
import { Move, Trash2, Check, Image, Loader2 } from 'lucide-react'
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
  const [tab, setTab] = useState('fields')

  // Fields state
  const [title, setTitle] = useState(media.title)
  const [overview, setOverview] = useState(media.overview ?? '')
  const [tagline, setTagline] = useState(media.movie?.tagline ?? '')
  const [showStatus, setShowStatus] = useState(media.show?.status ?? '')
  const [releaseDate, setReleaseDate] = useState(media.releaseDate?.slice(0, 10) ?? '')
  const [originalLanguage, setOriginalLanguage] = useState(media.originalLanguage ?? '')
  const [runtime, setRuntime] = useState(media.movie?.runtime?.toString() ?? '')

  // Image browser state
  const [browseType, setBrowseType] = useState('poster')
  const [browseLang, setBrowseLang] = useState('*')

  // Image overrides state: {imageType, languageCode, url, assetId?}
  const [imageOverrides, setImageOverrides] = useState<
    { imageType: string; languageCode: string; url: string; assetId?: string }[]
  >([])

  // Position state — for positioning backdrops as textless posters
  const [positionAsset, setPositionAsset] = useState<MediaAsset | null>(null)

  const needsPosition = (asset: MediaAsset) =>
    browseType === 'textless_poster' && asset.assetType === 'backdrop'

  const handlePositionComplete = useCallback(
    ({ positionX, positionY }: { positionX: number; positionY: number }) => {
      if (!positionAsset) return
      const positionedUrl = encodePositionInUrl(positionAsset.url, positionX, positionY)
      setImageOverrides((prev) => [
        ...prev.filter(
          (o) => !(o.imageType === browseType && o.languageCode === browseLang),
        ),
        { imageType: browseType, languageCode: browseLang, url: positionedUrl },
      ])
      toast({ title: 'Backdrop position saved', variant: 'success' })
      setPositionAsset(null)
    },
    [positionAsset, browseType, browseLang, toast],
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
    if (needsPosition(asset)) {
      setPositionAsset(asset)
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
    if (media.mediaType === 'movie' && runtime !== (media.movie?.runtime?.toString() ?? ''))
      c.runtime = runtime || null
    return c
  }, [title, overview, tagline, showStatus, releaseDate, originalLanguage, runtime, media])

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
      setRuntime(media.movie?.runtime?.toString() ?? '')
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
        <DkTabs defaultValue="fields" value={tab} onValueChange={setTab}>
          <DkTabList className="w-full">
            <DkTab value="fields" className="flex-1">Fields</DkTab>
            <DkTab value="images" className="flex-1">Images</DkTab>
            <DkTab value="preview" className="flex-1">Preview</DkTab>
          </DkTabList>

          {/* Fields tab */}
          <DkTabPanel value="fields">
            <div className="space-y-3">
              <DkInput
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <DkTextarea
                label="Overview"
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
                rows={4}
              />
              {media.mediaType === 'movie' && (
                <DkInput
                  label="Tagline"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                />
              )}
              {media.mediaType === 'movie' && (
                <DkInput
                  label="Runtime (minutes)"
                  type="number"
                  value={runtime}
                  onChange={(e) => setRuntime(e.target.value)}
                />
              )}
              {media.mediaType === 'show' && (
                <DkSelect
                  label="Status"
                  value={showStatus}
                  onChange={(e) => setShowStatus(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="returning_series">Returning Series</option>
                  <option value="ended">Ended</option>
                  <option value="canceled">Canceled</option>
                  <option value="in_production">In Production</option>
                  <option value="planned">Planned</option>
                  <option value="pilot">Pilot</option>
                </DkSelect>
              )}
              <DkInput
                label="Release Date"
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
              />
              <DkSelect
                label="Original Language"
                value={originalLanguage}
                onChange={(e) => setOriginalLanguage(e.target.value)}
              >
                <option value="">—</option>
                {LANGUAGES.filter((l) => l.code !== '*').map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </DkSelect>
            </div>
          </DkTabPanel>

          {/* Images tab — asset browser */}
          <DkTabPanel value="images">
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Browse existing media assets and select images per language.
                Selected overrides apply when users with matching language preferences view this page.
              </p>

              {/* Filter bar */}
              <div className="flex gap-2">
                <DkSelect
                  value={browseType}
                  onChange={(e) => setBrowseType(e.target.value)}
                  className="h-10 text-sm"
                >
                  {IMAGE_TYPES.map((it) => (
                    <option key={it.value} value={it.value}>
                      {it.label}
                    </option>
                  ))}
                </DkSelect>
                <DkSelect
                  value={browseLang}
                  onChange={(e) => setBrowseLang(e.target.value)}
                  className="h-10 text-sm"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </DkSelect>
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
                          'relative w-full overflow-hidden rounded-xl transition-all bg-black/20',
                          selected
                            ? 'ring-2 ring-primary'
                            : 'ring-1 ring-white/10 hover:ring-primary/50',
                        )}
                      >
                        <img
                          src={asset.url}
                          alt=""
                          className="w-full h-auto object-contain p-1"
                          loading="lazy"
                        />
                        {selected && (
                          <div className="absolute inset-0 flex items-center justify-center bg-primary/30">
                            <Check className="h-6 w-6 text-white drop-shadow-lg" />
                          </div>
                        )}
                        {needsPosition(asset) && (
                          <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded-md bg-primary/80 px-1.5 py-0.5 text-[9px] font-medium text-white">
                            <Move className="h-2.5 w-2.5" />
                            Position
                          </span>
                        )}
                        {!needsPosition(asset) && asset.lang && (
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
                        className="flex items-center gap-3 rounded-xl bg-[var(--dk-surface-ghost)] p-2 ring-1 ring-white/10"
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
          </DkTabPanel>

          {/* Preview tab */}
          <DkTabPanel value="preview">
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
                      <div className="rounded-xl bg-[var(--dk-surface-ghost)] p-3 ring-1 ring-white/10">
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
                          <div key={i} className="flex items-center gap-3 rounded-xl bg-[var(--dk-surface-ghost)] p-2 ring-1 ring-white/10">
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
          </DkTabPanel>
        </DkTabs>

        {/* Submit */}
        <div className="flex justify-end gap-2 pt-2">
          <DkButton variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </DkButton>
          <DkButton
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!hasChanges || createProposal.isPending}
            loading={createProposal.isPending}
          >
            Submit Proposal
          </DkButton>
        </div>
      </div>

      {/* Position overlay — backdrop → textless poster */}
      {positionAsset && (
        <div className="fixed inset-0 z-[calc(var(--dk-z-modal)+1)] flex items-center justify-center bg-black/60">
          <PositionModal
            imageUrl={positionAsset.url}
            aspect={2 / 3}
            onComplete={handlePositionComplete}
            onCancel={() => setPositionAsset(null)}
          />
        </div>
      )}
    </DkDialog>
  )
}
