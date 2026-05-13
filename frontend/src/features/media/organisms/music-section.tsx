import type { AlbumDetail, TrackOut } from '../media-queries'
import { cn } from '@/lib/utils'
import { Disc3, ExternalLink, Music2 } from 'lucide-react'

interface MusicSectionProps {
  album: AlbumDetail
  className?: string
}

function formatMs(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '—'
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Spotify-style audio feature keys we show when present on album or tracks */
const ALBUM_AUDIO_FEATURE_ORDER = [
  ['tempo', 'Tempo'],
  ['energy', 'Energy'],
  ['danceability', 'Dance'],
  ['valence', 'Valence'],
  ['acousticness', 'Acoustic'],
  ['instrumentalness', 'Instrumental'],
  ['liveness', 'Live'],
  ['speechiness', 'Speech'],
] as const

function AudioFeatureRow({
  featKey,
  label,
  features,
}: {
  featKey: string
  label: string
  features: Record<string, unknown>
}) {
  const raw = features[featKey]
  if (raw == null || typeof raw !== 'number') return null

  if (featKey === 'tempo') {
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-mono tabular-nums text-foreground/90">{Math.round(raw)} BPM</span>
        </div>
      </div>
    )
  }

  const pct = Math.round(Math.min(1, Math.max(0, raw)) * 100)
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums text-foreground/90">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-amber-500/80" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function renderAlbumAudioFeatures(features: Record<string, unknown> | null | undefined) {
  if (!features || typeof features !== 'object') return null
  const hasAny = ALBUM_AUDIO_FEATURE_ORDER.some(([k]) => {
    const v = features[k]
    return v != null && typeof v === 'number'
  })
  if (!hasAny) return null
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Audio features
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ALBUM_AUDIO_FEATURE_ORDER.map(([key, label]) => (
          <AudioFeatureRow key={key} featKey={key} label={label} features={features} />
        ))}
      </div>
    </div>
  )
}

function MetaItem({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null || value === '') return null
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium capitalize">{value}</dd>
    </div>
  )
}

function TrackRow({ track, showDisc }: { track: TrackOut; showDisc: boolean }) {
  const feats = track.audioFeatures
  const mini =
    feats && typeof feats === 'object'
      ? (['energy', 'danceability'] as const)
          .map((k) => {
            const v = feats[k]
            return typeof v === 'number' ? `${k.slice(0, 3)} ${Math.round(v * 100)}%` : null
          })
          .filter(Boolean)
          .join(' · ')
      : ''

  return (
    <tr className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.02]">
      <td className="w-10 py-2.5 pr-2 text-right font-mono text-xs text-muted-foreground">
        {showDisc ? `${track.discNumber}.${track.trackNumber}` : track.trackNumber}
      </td>
      <td className="py-2.5 pr-3">
        <div className="font-medium leading-snug">{track.title}</div>
        {mini && <div className="mt-0.5 text-[10px] text-muted-foreground">{mini}</div>}
      </td>
      <td className="hidden w-20 py-2.5 text-right font-mono text-xs text-muted-foreground sm:table-cell">
        {formatMs(track.durationMs)}
      </td>
      <td className="w-10 py-2.5 text-center">
        {track.previewUrl ? (
          <audio controls className="h-7 w-[120px] max-w-[28vw] sm:w-32" preload="none">
            <source src={track.previewUrl} type="audio/mpeg" />
          </audio>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  )
}

export function MusicSection({ album, className }: MusicSectionProps) {
  const tracks = album.tracks ?? []
  const multiDisc = tracks.some((t) => t.discNumber > 1)

  return (
    <section className={cn('space-y-8', className)}>
      <div className="flex items-center gap-2">
        <Music2 className="h-5 w-5 text-amber-500" aria-hidden />
        <h2 className="text-lg font-semibold">Album</h2>
      </div>

      {/* Release metadata */}
      <div className="rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-base)] p-5 shadow-[var(--dk-shadow-sm)]">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Release details
        </h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          <MetaItem label="Release type" value={album.releaseType} />
          <MetaItem label="Format" value={album.format} />
          <MetaItem label="Catalog #" value={album.catalogNumber} />
          <MetaItem label="Barcode" value={album.barcode} />
          <div>
            <dt className="text-xs text-muted-foreground">Tracks</dt>
            <dd className="text-sm font-medium">
              {tracks.length || album.trackCount}
              {album.discCount > 1 ? ` · ${album.discCount} discs` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Total length</dt>
            <dd className="text-sm font-medium">{formatMs(album.durationMs)}</dd>
          </div>
          {album.spotifyPopularity != null && (
            <div>
              <dt className="text-xs text-muted-foreground">Spotify popularity</dt>
              <dd className="text-sm font-medium">{album.spotifyPopularity}/100</dd>
            </div>
          )}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {album.spotifyUrl && (
            <a
              href={album.spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1DB954]/15 px-3 py-1.5 text-xs font-medium text-[#1DB954] hover:bg-[#1DB954]/25"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Spotify
            </a>
          )}
          {album.musicbrainzId && (
            <a
              href={`https://musicbrainz.org/release/${album.musicbrainzId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500/15 px-3 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/25"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              MusicBrainz
            </a>
          )}
          {album.musicbrainzReleaseGroupId && (
            <a
              href={`https://musicbrainz.org/release-group/${album.musicbrainzReleaseGroupId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-300/90 hover:bg-orange-500/20"
            >
              <Disc3 className="h-3.5 w-3.5" />
              Release group
            </a>
          )}
          {album.previewUrl && !album.spotifyUrl && (
            <a
              href={album.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Album preview
            </a>
          )}
        </div>
      </div>

      {renderAlbumAudioFeatures(album.audioFeatures)}

      {/* Track list */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Tracks ({tracks.length || album.trackCount})
        </h3>
        {tracks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No track listing synced yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)]">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="w-10 py-3 pr-2 text-right font-medium">#</th>
                  <th className="py-3 pr-3 font-medium">Title</th>
                  <th className="hidden w-20 py-3 text-right font-medium sm:table-cell">Time</th>
                  <th className="w-10 py-3 text-center font-medium">Preview</th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((t) => (
                  <TrackRow key={t.id} track={t} showDisc={multiDisc} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {album.spotifyId && (
        <p className="text-[11px] text-muted-foreground">
          Spotify ID: <span className="font-mono">{album.spotifyId}</span>
          {album.musicbrainzId && (
            <>
              {' · '}
              MB Release: <span className="font-mono">{album.musicbrainzId}</span>
            </>
          )}
        </p>
      )}
    </section>
  )
}
