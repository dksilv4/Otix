import { useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@auth/hooks/use-auth'
import { ArrowLeft, Check, Loader2, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mediaQueries, mediaTypeFromParam } from '@media'
import { useToast } from '@/old-features/ui/molecules/toast'
import { DkButton } from '@/old-features/ui/atoms/button'
import { DkInput } from '@/old-features/ui/atoms/input'
import { DkTextarea } from '@/old-features/ui/atoms/textarea'
import { DkSelect } from '@/old-features/ui/atoms/select'
import { useCreateProposal, useMediaAssets, useSetArtworkSelection, type MediaAsset } from '@/old-features/admin/admin-edit-queries'
import type { MediaItemDetail } from '@media/queries/media-queries'
import { useMirroring } from '../hooks/use-media-admin-settings'

const ARTWORK_TYPES: { value: string; label: string }[] = [
  { value: 'poster', label: 'Poster' },
  { value: 'backdrop', label: 'Backdrop' },
  { value: 'logo', label: 'Logo' },
  { value: 'textless_poster', label: 'Textless poster' },
  { value: 'icon', label: 'Icon' },
]

const PORTRAIT = new Set(['poster', 'textless_poster', 'icon'])

function useMediaDetail(mediaType: string, id: string) {
  return useQuery(mediaQueries.detail(mediaType, id))
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', className)}>
      {children}
    </span>
  )
}

// ── Admin gate ───────────────────────────────────────────────────────
function AdminDenied() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/10 text-amber-400">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-semibold">Admin access required</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Only admins can choose artwork for a media item.
      </p>
    </div>
  )
}

// ── Artwork tab ──────────────────────────────────────────────────────
function ArtworkTab({
  mediaType,
  mediaId,
}: {
  mediaType: string
  mediaId: string
}) {
  const { toast } = useToast()
  const { user } = useAuth()
  const mirroring = useMirroring(Boolean(user?.isAdmin))
  const { data: assetData, isLoading } = useMediaAssets(mediaType, mediaId)
  const selection = useSetArtworkSelection(mediaType, mediaId)
  const [type, setType] = useState('poster')

  const assets = useMemo(() => assetData?.items ?? [], [assetData])
  const typeAssets = useMemo(() => assets.filter((a) => a.assetType === type), [assets, type])
  const pinned = typeAssets.find((a) => a.isSelected)
  const current = typeAssets.find((a) => a.isCurrent)
  const mirroringOn = mirroring.isSuccess ? mirroring.data.enabled : null

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const a of assets) map[a.assetType] = (map[a.assetType] ?? 0) + 1
    return map
  }, [assets])

  const toggle = async (asset: MediaAsset) => {
    const selecting = !asset.isSelected
    try {
      await selection.mutateAsync({ assetId: asset.id, selected: selecting })
      toast({
        title: selecting ? 'Artwork updated' : 'Selection cleared',
        description: selecting
          ? `${labelFor(asset.assetType)} set to this image.`
          : 'Using the automatic choice again.',
        variant: 'success',
      })
    } catch {
      toast({ title: 'Failed to update artwork', variant: 'error' })
    }
  }

  return (
    <div className="space-y-5">
      {/* Mirroring + current state strip */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-sm">
        <span className="text-muted-foreground">Downloader</span>
        {mirroringOn === null ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : mirroringOn ? (
          <Chip className="bg-emerald-400/10 text-emerald-300">On — picks are mirrored</Chip>
        ) : (
          <Chip className="bg-muted text-muted-foreground">Off — choice saved, image not downloaded</Chip>
        )}
        <span className="mx-1 text-border/70">|</span>
        {pinned ? (
          <span className="text-muted-foreground">
            <span className="font-medium text-amber-300">Admin-chosen</span> image will be used.
          </span>
        ) : current ? (
          <span className="text-muted-foreground">
            Using the <span className="font-medium text-foreground">automatic</span> choice. Pick an image to override it.
          </span>
        ) : (
          <span className="text-muted-foreground">No {labelFor(type)} assets for this item yet.</span>
        )}
      </div>

      {/* Type pills */}
      <div className="flex flex-wrap gap-1.5">
        {ARTWORK_TYPES.map((t) => {
          const activeType = type === t.value
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                activeType
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border/70 text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              {t.label}
              {counts[t.value] ? <span className="ml-1.5 text-xs opacity-60">{counts[t.value]}</span> : null}
            </button>
          )
        })}
      </div>

      {/* Asset grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : typeAssets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">No {labelFor(type).toLowerCase()} images</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This provider hasn't supplied any {labelFor(type).toLowerCase()} for this title yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {typeAssets.map((asset) => {
            const isPinned = asset.isSelected
            const inUse = !isPinned && asset.isCurrent
            const isPortrait = PORTRAIT.has(asset.assetType)
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => toggle(asset)}
                className={cn(
                  'group overflow-hidden rounded-xl border bg-background/40 text-left transition-all',
                  isPinned
                    ? 'border-amber-400/70 ring-2 ring-amber-400/30'
                    : inUse
                      ? 'border-primary/60'
                      : 'border-border/70 hover:border-border',
                )}
              >
                <div
                  className={cn(
                    'relative w-full overflow-hidden bg-muted/30',
                    isPortrait ? 'aspect-[2/3]' : 'aspect-video',
                  )}
                >
                  <img
                    src={asset.url}
                    alt=""
                    loading="lazy"
                    className={cn(
                      'h-full w-full',
                      asset.assetType === 'logo' ? 'object-contain p-2' : 'object-cover',
                    )}
                  />
                  {(isPinned || inUse) && (
                    <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                      {isPinned ? (
                        <>
                          <Check className="h-3 w-3 text-amber-300" /> Selected
                        </>
                      ) : (
                        'In use'
                      )}
                    </span>
                  )}
                  {asset.localName && (
                    <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 backdrop-blur">
                      Downloaded
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px]">
                  {asset.provider && <span className="text-muted-foreground">{asset.provider}</span>}
                  {asset.lang && <span className="uppercase text-muted-foreground/70">{asset.lang}</span>}
                  {asset.score != null && <span className="ml-auto text-amber-400/90">★{asset.score}</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Selection hint */}
      <p className="text-xs text-muted-foreground">
        Click an image to use it for this {labelFor(type)} slot — the choice applies to every user. Click the selected
        image again to return to the automatic pick.
      </p>
    </div>
  )
}

function labelFor(type: string): string {
  return ARTWORK_TYPES.find((t) => t.value === type)?.label ?? type
}

// ── Details tab (metadata proposal) ──────────────────────────────────
const FIELD_LANGUAGES = ['en', 'ja', 'ko', 'zh', 'es', 'fr', 'de']

function DetailsForm({
  media,
  mediaType,
  mediaId,
}: {
  media: MediaItemDetail
  mediaType: string
  mediaId: string
}) {
  const { toast } = useToast()
  const createProposal = useCreateProposal(mediaType, mediaId)
  const [title, setTitle] = useState(media.title)
  const [overview, setOverview] = useState(media.overview ?? '')
  const [tagline, setTagline] = useState(media.movie?.tagline ?? '')
  const [showStatus, setShowStatus] = useState(media.show?.status ?? '')
  const [releaseDate, setReleaseDate] = useState(media.releaseDate?.slice(0, 10) ?? '')
  const [originalLanguage, setOriginalLanguage] = useState(media.originalLanguage ?? '')
  const [runtime, setRuntime] = useState(media.movie?.runtime?.toString() ?? '')

  const changes = useMemo(() => {
    const c: Record<string, unknown> = {}
    if (title !== media.title) c.title = title
    if (overview !== (media.overview ?? '')) c.overview = overview || null
    if (media.mediaType === 'movie' && tagline !== (media.movie?.tagline ?? '')) c.tagline = tagline || null
    if (media.mediaType === 'show' && showStatus !== (media.show?.status ?? '')) c.status = showStatus || null
    if (releaseDate !== (media.releaseDate?.slice(0, 10) ?? '')) c.release_date = releaseDate || null
    if (originalLanguage !== (media.originalLanguage ?? '')) c.original_language = originalLanguage || null
    if (media.mediaType === 'movie' && runtime !== (media.movie?.runtime?.toString() ?? ''))
      c.runtime = runtime ? Number(runtime) : null
    return c
  }, [title, overview, tagline, showStatus, releaseDate, originalLanguage, runtime, media])

  const hasChanges = Object.keys(changes).length > 0

  const submit = async () => {
    if (!hasChanges) return
    try {
      await createProposal.mutateAsync({ changes, imageOverrides: null })
      toast({ title: 'Edit proposal submitted', description: 'An admin can review and apply it.', variant: 'success' })
    } catch {
      toast({ title: 'Failed to submit proposal', variant: 'error' })
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <DkInput label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <DkTextarea label="Overview" value={overview} onChange={(e) => setOverview(e.target.value)} rows={5} />
        {media.mediaType === 'movie' && (
          <DkInput label="Tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} />
        )}
        {media.mediaType === 'show' && (
          <DkSelect label="Status" value={showStatus} onChange={(e) => setShowStatus(e.target.value)}>
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
          label="Release date"
          type="date"
          value={releaseDate}
          onChange={(e) => setReleaseDate(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <DkSelect
            label="Original language"
            value={originalLanguage}
            onChange={(e) => setOriginalLanguage(e.target.value)}
          >
            <option value="">—</option>
            {FIELD_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </DkSelect>
          {media.mediaType === 'movie' && (
            <DkInput
              label="Runtime (minutes)"
              type="number"
              value={runtime}
              onChange={(e) => setRuntime(e.target.value)}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col">
        <div className="rounded-xl border border-border/60 bg-background/40 p-4">
          <p className="mb-3 text-sm font-semibold">Review changes</p>
          {!hasChanges ? (
            <p className="text-sm text-muted-foreground">No changes yet.</p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(changes).map(([field, value]) => (
                <li key={field} className="flex items-baseline gap-3 text-sm">
                  <span className="w-36 shrink-0 font-mono text-xs text-muted-foreground">{field}</span>
                  <span className={cn(value === null && 'italic text-muted-foreground')}>
                    {value === null ? '(clear)' : String(value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-auto pt-5 text-sm text-muted-foreground">
          <p>
            Metadata edits are submitted as a community proposal and appear after an admin approves them. To override
            artwork directly, use the <span className="font-medium text-foreground">Artwork</span> tab.
          </p>
        </div>
        <div className="mt-4 flex justify-end">
          <DkButton variant="primary" onClick={submit} disabled={!hasChanges || createProposal.isPending} loading={createProposal.isPending}>
            Submit Proposal
          </DkButton>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────
export function MediaManagePage() {
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }
  const mediaType = mediaTypeFromParam(params.mediaType || 'movie')
  const mediaId = params.mediaId || ''
  const { user } = useAuth()
  const { data: detail } = useMediaDetail(mediaType, mediaId)
  const [tab, setTab] = useState<'artwork' | 'details'>('artwork')

  if (!mediaId) return <AdminDenied />
  if (!user?.isAdmin) return <AdminDenied />

  return (
    <div className="mx-auto w-full max-w-5xl animate-fade-in px-4 pb-24 pt-8 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/media/$mediaType/$mediaId"
          params={{ mediaType, mediaId }}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Back to media"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Manage {mediaType}</p>
          <h1 className="truncate text-xl font-semibold tracking-tight">{detail?.title ?? 'Loading…'}</h1>
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 border-b border-border/60">
        {(
          [
            ['artwork', 'Artwork'],
            ['details', 'Details'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="glass-card px-5 py-6 sm:px-7">
        {tab === 'artwork' ? (
          <ArtworkTab mediaType={mediaType} mediaId={mediaId} />
        ) : detail ? (
          <DetailsForm media={detail} mediaType={mediaType} mediaId={mediaId} />
        ) : (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}
