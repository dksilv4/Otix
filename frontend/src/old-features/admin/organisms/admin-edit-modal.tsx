// TODO: Review this file
import { useState, useMemo, useCallback } from 'react'
import { DkDialog } from '@/old-features/dk-ui/molecules/dialog'
import { DkInput } from '@/old-features/dk-ui/atoms/input'
import { DkTextarea } from '@/old-features/dk-ui/atoms/textarea'
import { DkSelect } from '@/old-features/dk-ui/atoms/select'
import { DkButton } from '@/old-features/dk-ui/atoms/button'
import { DkTabs, DkTabList, DkTab, DkTabPanel } from '@/old-features/dk-ui/molecules/tabs'
import { useToast } from '@/old-features/dk-ui/molecules/toast'
import { useCreateProposal, useMediaAssets, ADMIN_XP, type ImageOverrideItem, type MediaAsset } from '../admin-edit-queries'
import type { MediaItemDetail } from '@/old-features/media/media-queries'
import { PositionModal } from '@/old-features/settings/molecules/position-modal'
import { encodePositionInUrl } from '@/lib/utils/image-position'

import { showXPToast } from '@/old-features/dk-ui/atoms/xp-toast'
import { Move, Trash2, Check, Image, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import './admin-edit-modal.scss'

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
      className="dk-admin-edit-modal"
    >
      <div className="dk-admin-edit-modal__content">
        <DkTabs defaultValue="fields" value={tab} onValueChange={setTab}>
          <DkTabList className="dk-admin-edit-modal__tablist">
            <DkTab value="fields" className="dk-admin-edit-modal__tab">Fields</DkTab>
            <DkTab value="images" className="dk-admin-edit-modal__tab">Images</DkTab>
            <DkTab value="preview" className="dk-admin-edit-modal__tab">Preview</DkTab>
          </DkTabList>

          {/* Fields tab */}
          <DkTabPanel value="fields">
            <div className="dk-admin-edit-modal__fields">
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
            <div className="dk-admin-edit-modal__images">
              <p className="dk-admin-edit-modal__images-desc">
                Browse existing media assets and select images per language.
                Selected overrides apply when users with matching language preferences view this page.
              </p>

              {/* Filter bar */}
              <div className="dk-admin-edit-modal__filter">
                <DkSelect
                  value={browseType}
                  onChange={(e) => setBrowseType(e.target.value)}
                  className="dk-admin-edit-modal__filter-select"
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
                  className="dk-admin-edit-modal__filter-select"
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
                <div className="dk-admin-edit-modal__loading">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredAssets.length === 0 ? (
                <div className="dk-admin-edit-modal__empty">
                  <Image className="h-8 w-8 text-muted-foreground/40" />
                  <p className="dk-admin-edit-modal__empty-text">No assets found for this type.</p>
                  <p className="dk-admin-edit-modal__empty-hint">
                    Try selecting a different image type.
                  </p>
                </div>
              ) : (
                <div className="dk-admin-edit-modal__grid">
                  {filteredAssets.map((asset) => {
                    const selected = isAssetSelected(asset)
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => selectAsset(asset)}
                        disabled={selected}
                        className={cn(
                          'dk-admin-edit-modal__asset',
                          selected && 'dk-admin-edit-modal__asset--selected',
                        )}
                      >
                        <img
                          src={asset.url}
                          alt=""
                          className="dk-admin-edit-modal__asset-image"
                          loading="lazy"
                        />
                        {selected && (
                          <div className="dk-admin-edit-modal__asset-check">
                            <Check className="h-6 w-6 text-white drop-shadow-lg" />
                          </div>
                        )}
                        {needsPosition(asset) && (
                          <span className="dk-admin-edit-modal__badge-position">
                            <Move className="h-2.5 w-2.5" />
                            Position
                          </span>
                        )}
                        {!needsPosition(asset) && asset.lang && (
                          <span className="dk-admin-edit-modal__badge-lang">
                            {asset.lang.toUpperCase()}
                          </span>
                        )}
                        {asset.provider && (
                          <span className="dk-admin-edit-modal__badge-provider">
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
                <div className="dk-admin-edit-modal__overrides">
                  <p className="dk-admin-edit-modal__overrides-header">
                    Selected Overrides ({imageOverrides.length})
                  </p>
                  <div className="dk-admin-edit-modal__override-list">
                    {imageOverrides.map((item, i) => (
                      <div
                        key={i}
                        className="dk-admin-edit-modal__override"
                      >
                        <img
                          src={item.url}
                          alt=""
                          className="dk-admin-edit-modal__override-image"
                        />
                        <div className="dk-admin-edit-modal__override-info">
                          <p className="dk-admin-edit-modal__override-title">
                            {typeLabel(item.imageType)}
                          </p>
                          <p className="dk-admin-edit-modal__override-subtitle">
                            {langLabel(item.languageCode)} · {item.url}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeImageOverride(i)}
                          className="dk-admin-edit-modal__override-delete"
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
            <div className="dk-admin-edit-modal__preview">
              {!hasChanges ? (
                <p className="dk-admin-edit-modal__preview-empty">
                  No changes to preview.
                </p>
              ) : (
                <>
                  {Object.keys(changes).length > 0 && (
                    <div className="dk-admin-edit-modal__preview-section">
                      <p className="dk-admin-edit-modal__preview-header">Field Changes</p>
                      <div className="dk-admin-edit-modal__preview-content">
                        {Object.entries(changes).map(([field, value]) => (
                          <div key={field} className="dk-admin-edit-modal__preview-row">
                            <span className="dk-admin-edit-modal__preview-label">
                              {field}
                            </span>
                            <span className="dk-admin-edit-modal__preview-value">
                              {value === null ? '(clear)' : String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {imageOverrides.length > 0 && (
                    <div className="dk-admin-edit-modal__preview-section">
                      <p className="dk-admin-edit-modal__preview-header">Image Overrides</p>
                      <div className="dk-admin-edit-modal__preview-image-overrides">
                        {imageOverrides.map((item, i) => (
                          <div key={i} className="dk-admin-edit-modal__preview-override">
                            <img
                              src={item.url}
                              alt=""
                              className="dk-admin-edit-modal__preview-override-image"
                            />
                            <div className="dk-admin-edit-modal__preview-override-info">
                              <span className="dk-admin-edit-modal__preview-override-name">
                                {typeLabel(item.imageType)}
                              </span>
                              <span className="dk-admin-edit-modal__preview-override-lang">
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
        <div className="dk-admin-edit-modal__submit">
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
        <div className="dk-admin-edit-modal__overlay">
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
