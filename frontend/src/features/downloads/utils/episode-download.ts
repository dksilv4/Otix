import type { ServerArrQueueItem } from '../arr-types'

export interface ParsedEpisodeInfo {
  showName: string | null
  seasonNumber: number | null
  episodeNumber: number | null
  episodeTitle: string | null
  quality: string | null
  resolution: string | null
}

const EPISODE_REGEX =
  /^(.*?)[.\s]+(?:(?:\(?\d{4}\)?)[.\s]+)?[sS](\d{1,2})[eE](\d{1,3})(?:[.\s]+(.*?))?(?:[.\s]+(?:2160p|1080p|720p|480p|WEB-DL|WEBDL|HDR|BluRay|BDRip|HDTV|NF|AMZN|HMAX|ATVP|x264|x265|H\.264|H\.265|DDP|DD5\.1|Atmos|AAC).*|$)/i

const TAGS_CLEAN_REGEX =
  /\b(2160p|1080p|720p|480p|WEB-DL|WEBDL|HDR|BluRay|BDRip|HDTV|NF|AMZN|HMAX|ATVP|x264|x265|H\.264|H\.265|DDP|DD5\.1|Atmos|AAC)\b.*$/i

export const parseEpisodeRelease = (title?: string | null): ParsedEpisodeInfo => {
  if (!title) {
    return {
      showName: null,
      seasonNumber: null,
      episodeNumber: null,
      episodeTitle: null,
      quality: null,
      resolution: null,
    }
  }

  const m = EPISODE_REGEX.exec(title)
  let showName: string | null = null
  let seasonNumber: number | null = null
  let episodeNumber: number | null = null
  let episodeTitle: string | null = null

  if (m) {
    showName = m[1]?.replace(/\./g, ' ').trim() || null
    seasonNumber = m[2] ? parseInt(m[2], 10) : null
    episodeNumber = m[3] ? parseInt(m[3], 10) : null
    const rawEp = (m[4] || '').replace(/\./g, ' ').trim()
    if (rawEp) {
      const cleaned = rawEp.replace(TAGS_CLEAN_REGEX, '').trim()
      episodeTitle = cleaned || null
    }
  }

  let resolution: string | null = null
  if (/2160p|4k/i.test(title)) resolution = '4K'
  else if (/1080p/i.test(title)) resolution = '1080p'
  else if (/720p/i.test(title)) resolution = '720p'

  let quality: string | null = null
  if (/remux/i.test(title)) quality = 'Remux'
  else if (/web-?dl/i.test(title)) quality = 'WEB-DL'
  else if (/bluray/i.test(title)) quality = 'BluRay'
  else if (/hdtv/i.test(title)) quality = 'HDTV'

  return {
    showName,
    seasonNumber,
    episodeNumber,
    episodeTitle,
    quality,
    resolution,
  }
}

export interface ResolvedEpisodeMetadata {
  showTitle: string
  seasonNumber: number | null
  episodeNumber: number | null
  episodeTitle: string | null
  mediaItemId: string | number | null
  stillUrl: string | null
  posterUrl: string | null
  backdropUrl: string | null
  quality: string | null
  resolution: string | null
  protocol: string
  downloadClient: string | null
  percentage: number
  sizeBytes: number
  sizeLeftBytes: number
  downloadedBytes: number
  timeleft: string | null
  status: string
  releaseTitle: string
}

export const resolveEpisodeMetadata = (item: ServerArrQueueItem): ResolvedEpisodeMetadata => {
  const parsed = parseEpisodeRelease(item.title)

  const showTitle =
    item.showTitle ||
    item.show_title ||
    item.series?.title ||
    parsed.showName ||
    item.title ||
    'Unknown Series'

  const seasonNumber =
    item.seasonNumber ??
    item.season_number ??
    item.episode?.seasonNumber ??
    parsed.seasonNumber ??
    null

  const episodeNumber =
    item.episodeNumber ??
    item.episode_number ??
    item.episode?.episodeNumber ??
    parsed.episodeNumber ??
    null

  const episodeTitle =
    item.episodeName ||
    item.episode_name ||
    item.episode?.title ||
    parsed.episodeTitle ||
    (episodeNumber != null ? `Episode ${episodeNumber}` : null)

  const mediaItemId = item.mediaItemId ?? item.media_item_id ?? null
  const stillUrl = item.episodeStillUrl || item.episode_still_url || null

  let posterUrl = item.showPosterUrl || item.show_poster_url || null
  let backdropUrl = item.showBackdropUrl || item.show_backdrop_url || null

  if (!posterUrl && item.series?.images) {
    const p = item.series.images.find((img) => img.coverType === 'poster' && (img.remoteUrl || img.url))
    posterUrl = p?.remoteUrl || p?.url || null
  }
  if (!backdropUrl && item.series?.images) {
    const f = item.series.images.find((img) => (img.coverType === 'fanart' || img.coverType === 'background') && (img.remoteUrl || img.url))
    backdropUrl = f?.remoteUrl || f?.url || null
  }

  const qualityName = item.quality?.quality?.name || parsed.quality || null
  const resolution =
    (item.quality?.quality?.resolution ? `${item.quality.quality.resolution}p` : null) ||
    parsed.resolution ||
    null

  const sizeBytes = item.size || 0
  const sizeLeftBytes = item.sizeLeft ?? item.size_left ?? 0
  const downloadedBytes = Math.max(0, sizeBytes - sizeLeftBytes)

  let percentage = 0
  if (sizeBytes > 0) {
    percentage = Math.min(100, Math.max(0, ((sizeBytes - sizeLeftBytes) / sizeBytes) * 100))
  }

  return {
    showTitle,
    seasonNumber,
    episodeNumber,
    episodeTitle,
    mediaItemId,
    stillUrl,
    posterUrl,
    backdropUrl,
    quality: qualityName,
    resolution,
    protocol: item.protocol || 'usenet',
    downloadClient: item.downloadClient || item.download_client || null,
    percentage: Math.round(percentage * 10) / 10,
    sizeBytes,
    sizeLeftBytes,
    downloadedBytes,
    timeleft: item.timeleft || item.estimatedCompletionTime || item.estimated_completion_time || null,
    status: item.status || 'Downloading',
    releaseTitle: item.title,
  }
}

export interface ResolvedMovieMetadata {
  movieTitle: string
  year: number | null
  mediaItemId: string | number | null
  posterUrl: string | null
  backdropUrl: string | null
  quality: string | null
  resolution: string | null
  protocol: string
  percentage: number
  sizeBytes: number
  sizeLeftBytes: number
  downloadedBytes: number
  timeleft: string | null
  status: string
  releaseTitle: string
}

export const resolveMovieMetadata = (item: ServerArrQueueItem): ResolvedMovieMetadata => {
  const movieTitle =
    item.movieTitle ||
    item.movie_title ||
    item.movie?.title ||
    item.title ||
    'Unknown Movie'

  const year = item.movieYear ?? item.movie_year ?? item.movie?.year ?? null
  const mediaItemId = item.mediaItemId ?? item.media_item_id ?? null

  let posterUrl = item.posterUrl || item.poster_url || null
  let backdropUrl = item.backdropUrl || item.backdrop_url || null

  if (!posterUrl && item.movie?.images) {
    const p = item.movie.images.find((img) => img.coverType === 'poster' && (img.remoteUrl || img.url))
    posterUrl = p?.remoteUrl || p?.url || null
  }
  if (!backdropUrl && item.movie?.images) {
    const f = item.movie.images.find((img) => (img.coverType === 'fanart' || img.coverType === 'background') && (img.remoteUrl || img.url))
    backdropUrl = f?.remoteUrl || f?.url || null
  }

  const qualityName = item.quality?.quality?.name || null
  const resolution = item.quality?.quality?.resolution ? `${item.quality.quality.resolution}p` : null

  const sizeBytes = item.size || 0
  const sizeLeftBytes = item.sizeLeft ?? item.size_left ?? 0
  const downloadedBytes = Math.max(0, sizeBytes - sizeLeftBytes)

  let percentage = 0
  if (sizeBytes > 0) {
    percentage = Math.min(100, Math.max(0, ((sizeBytes - sizeLeftBytes) / sizeBytes) * 100))
  }

  return {
    movieTitle,
    year,
    mediaItemId,
    posterUrl,
    backdropUrl,
    quality: qualityName,
    resolution,
    protocol: item.protocol || 'torrent',
    percentage: Math.round(percentage * 10) / 10,
    sizeBytes,
    sizeLeftBytes,
    downloadedBytes,
    timeleft: item.timeleft || item.estimatedCompletionTime || item.estimated_completion_time || null,
    status: item.status || 'Downloading',
    releaseTitle: item.title,
  }
}
