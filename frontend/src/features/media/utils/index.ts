import type { MediaItemDetail, SeasonOut } from '../queries/media-queries'
import { sanitizeImageUrl } from '@/lib/utils/image-url'

// ── Type guards ──

export function isMovie(detail: MediaItemDetail): detail is MediaItemDetail & { movie: NonNullable<MediaItemDetail['movie']> } {
  return detail.mediaType === 'movie' && detail.movie != null
}

export function isShow(detail: MediaItemDetail): detail is MediaItemDetail & { show: NonNullable<MediaItemDetail['show']> } {
  return detail.mediaType === 'show' && detail.show != null
}

export function isGame(detail: MediaItemDetail): detail is MediaItemDetail & { game: NonNullable<MediaItemDetail['game']> } {
  return detail.mediaType === 'game' && detail.game != null
}

export function isMusic(detail: MediaItemDetail): detail is MediaItemDetail & { album: NonNullable<MediaItemDetail['album']> } {
  return detail.mediaType === 'music' && detail.album != null
}

// ── Route parameter parsing ──

export function mediaTypeFromParam(param: string): 'movie' | 'show' | 'game' | 'music' {
  if (param === 'movie' || param === 'show' || param === 'game' || param === 'music') return param
  return 'movie'
}

// ── General Formatters ──

export function formatMusicCreditsLine(credits?: MediaItemDetail['credits'] | null): string | null {
  const all = Array.isArray(credits) ? credits : []
  const primary = all.filter((c) => c && c.role === 'primary' && c.person?.name).map((c) => c.person!.name)
  const featured = all.filter((c) => c && c.role === 'featured' && c.person?.name).map((c) => c.person!.name)
  if (primary.length === 0 && featured.length === 0) return null
  const head = primary.join(', ')
  const tail = featured.length ? `feat. ${featured.join(', ')}` : ''
  if (head && tail) return `${head} · ${tail}`
  return head || tail || null
}

export function formatYear(dateStr?: string | null): string {
  if (!dateStr) return ''
  return dateStr.slice(0, 4)
}

export function formatDate(dateStr?: string | null): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function seoDescription(overview?: string | null, title?: string): string {
  if (overview) return overview.length > 200 ? overview.slice(0, 197) + '...' : overview
  return `Details for ${title || 'this title'} on Otix`
}

export function formatRuntime(minutes?: number | null): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function formatAlbumDuration(ms?: number | null): string {
  if (ms == null || ms <= 0) return ''
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    const rem = m % 60
    return `${h}h ${rem}m`
  }
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`
}

export function backdropSrc(url: string): string {
  if (!url) return ''
  let clean = url
  if (clean.includes('/w500/')) clean = clean.replace(/\/w500\//, '/original/')
  return sanitizeImageUrl(clean)
}

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

export function formatMs(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '—'
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatNumber(n?: number): string {
  if (n == null) return ''
  return new Intl.NumberFormat('en-US').format(n)
}

export function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  if (hours < 1) return `${Math.round(hours * 10) / 10}h`
  return `${Math.round(hours)}h`
}

export function formatMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

export function formatDaysAgo(unixTimestamp: number): string {
  const days = Math.floor((Date.now() / 1000 - unixTimestamp) / 86400)
  if (days <= 0) return "Today"
  if (days === 1) return "1 day ago"
  return `${days} days ago`
}

export function formatCurrency(amount?: number): string {
  if (!amount) return ''
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function isTitleMatch(gameTitle: string, mediaTitle: string): boolean {
  if (!gameTitle || !mediaTitle) return false;
  const norm = (str: string) => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\bii\b/g, '2')
      .replace(/\biii\b/g, '3')
      .replace(/\biv\b/g, '4')
      .replace(/\bv\b/g, '5')
      .replace(/\bvi\b/g, '6')
      .replace(/\bvii\b/g, '7')
      .replace(/\bviii\b/g, '8')
      .replace(/\bix\b/g, '9')
      .replace(/\bx\b/g, '10')
      .replace(/\s+/g, '')
      .trim();
  };
  return norm(gameTitle) === norm(mediaTitle);
}

interface CreditItem {
  id: string
  person: { id: string; name: string; photoUrl?: string } | null
  role: string
  characterName?: string
  sortOrder: number
}

export function groupByRole(credits?: CreditItem[] | null) {
  const list = Array.isArray(credits) ? credits : []
  const valid = list.filter((c) => c != null && c.person != null)
  const cast = valid.filter((c) => c.role === 'cast')
  const directors = valid.filter((c) => c.role === 'director')
  const writers = valid.filter((c) => c.role === 'writer')
  const producers = valid.filter((c) => c.role === 'producer')
  const composers = valid.filter((c) => c.role === 'composer')
  const crew = valid.filter(
    (c) => !['cast', 'director', 'writer', 'producer', 'composer'].includes(c.role),
  )
  return { cast, directors, writers, producers, composers, crew }
}


export function getPreferredSeason(seasons?: SeasonOut[] | null): number {
  if (!Array.isArray(seasons) || seasons.length === 0) return 0
  return seasons[seasons.length - 1]?.seasonNumber ?? 0
}

// ── Trailers / Videos ──

export interface MediaVideoLike {
  videoType?: string | null
  url: string
  providerId?: string | null
}

const TRAILER_PRIORITY = ['Trailer', 'Teaser', 'game_video']
const VIDEO_PRIORITY = [
  'Trailer',
  'Teaser',
  'game_video',
  'Clip',
  'Featurette',
  'Behind the Scenes',
  'Bloopers',
]

export function youtubeIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      if (u.pathname === '/watch') return u.searchParams.get('v')
      const id = u.pathname.split('/').filter(Boolean).pop()
      return id || null
    }
  } catch {
    /* ignore malformed urls */
  }
  return null
}

export function extractYoutubeId(video: MediaVideoLike): string | null {
  const fromUrl = youtubeIdFromUrl(video.url)
  if (fromUrl) return fromUrl
  if (video.providerId && /^[a-zA-Z0-9_-]{11}$/.test(video.providerId)) {
    return video.providerId
  }
  return null
}

export function formatVideoTypeLabel(videoType?: string | null): string {
  if (!videoType) return 'Video'
  const lower = videoType.toLowerCase().replace(/[_-]/g, ' ')
  if (lower === 'game video' || lower === 'gameplay') return 'Gameplay'
  if (lower === 'trailer') return 'Trailer'
  if (lower === 'teaser') return 'Teaser'
  if (lower === 'featurette') return 'Featurette'
  if (lower === 'behind the scenes') return 'Behind the Scenes'
  if (lower === 'clip') return 'Clip'
  return videoType.charAt(0).toUpperCase() + videoType.slice(1)
}

export function allMediaVideos(detail: { videos?: MediaVideoLike[] }) {
  return (detail.videos || [])
    .map((v) => ({ ...v, youtubeId: extractYoutubeId(v) }))
    .filter((v): v is MediaVideoLike & { youtubeId: string } => v.youtubeId != null)
    .sort((a, b) => {
      const ra = VIDEO_PRIORITY.indexOf(a.videoType || '')
      const rb = VIDEO_PRIORITY.indexOf(b.videoType || '')
      const pa = ra === -1 ? 99 : ra
      const pb = rb === -1 ? 99 : rb
      return pa - pb
    })
}

export function trailerVideos(detail: { videos?: MediaVideoLike[] }) {
  return allMediaVideos(detail).filter((v) =>
    TRAILER_PRIORITY.includes(v.videoType || '') || !v.videoType,
  )
}

export function primaryTrailer(detail: { videos?: MediaVideoLike[] }) {
  return trailerVideos(detail)[0] ?? allMediaVideos(detail)[0] ?? null
}

export function scoreToColor(score: number, maxScore: number = 10): string {
  const t = Math.max(0, Math.min(1, score / maxScore))
  if (t < 0.25) return "bg-blue-800/60"
  if (t < 0.45) return "bg-blue-600/60"
  if (t < 0.55) return "bg-emerald-600/60"
  if (t < 0.65) return "bg-emerald-500/60"
  if (t < 0.72) return "bg-lime-500/60"
  if (t < 0.78) return "bg-yellow-500/60"
  if (t < 0.84) return "bg-orange-500/60"
  if (t < 0.90) return "bg-orange-600/70"
  return "bg-red-500/70"
}
