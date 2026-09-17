import type { ArrServiceInstance } from '@/features/downloads/arr-instances'
import type { ServerArrQueueItem } from '@/features/downloads/arr-types'
import type { RequestInstance, RequestWidget } from '../components/organisms/plugin-detail-actions'

export type ArrLookupItem = Record<string, unknown>

export type ArrRequestStatus = RequestInstance['status']

export function isArrMediaType(mediaType: string): mediaType is 'movie' | 'show' {
  return mediaType === 'movie' || mediaType === 'show'
}

export function yearFromReleaseDate(releaseDate?: string | null): number | undefined {
  if (!releaseDate) return undefined
  const year = Number(String(releaseDate).slice(0, 4))
  return Number.isFinite(year) && year > 1800 ? year : undefined
}

export function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function lookupTmdbTerm(tmdbId: string | number): string {
  return `tmdb:${tmdbId}`
}

function pick(item: ArrLookupItem | null | undefined, ...keys: string[]): unknown {
  if (!item) return undefined
  for (const key of keys) {
    if (item[key] != null) return item[key]
  }
  return undefined
}

export function matchLookupByTmdb(items: unknown, tmdbId: string | number): ArrLookupItem | null {
  const list = Array.isArray(items) ? items : items && typeof items === 'object' ? [items] : []
  const wanted = String(tmdbId)
  const records = list.filter((item): item is ArrLookupItem => !!item && typeof item === 'object')
  const exact = records.find((item) => String(pick(item, 'tmdbId', 'tmdb_id') ?? '') === wanted)
  return exact || records[0] || null
}

export function libraryIdFromLookup(item: ArrLookupItem | null): number | null {
  const id = asNumber(pick(item, 'id'))
  return id && id > 0 ? id : null
}

export function radarrStatusFromLookup(item: ArrLookupItem | null): ArrRequestStatus {
  if (!item || !libraryIdFromLookup(item)) return 'not_exists'
  const hasFile = Boolean(pick(item, 'hasFile', 'has_file'))
  return hasFile ? 'downloaded' : 'requested'
}

export function sonarrStatusFromLookup(item: ArrLookupItem | null): ArrRequestStatus {
  if (!item || !libraryIdFromLookup(item)) return 'not_exists'
  const stats = (pick(item, 'statistics') as ArrLookupItem | undefined) || {}
  const files = asNumber(pick(stats, 'episodeFileCount', 'episode_file_count')) ?? 0
  return files > 0 ? 'downloaded' : 'requested'
}

export function fileFromRadarrLookup(item: ArrLookupItem | null): RequestInstance['file'] {
  if (!item) return null
  const movieFile = (pick(item, 'movieFile', 'movie_file') as ArrLookupItem | undefined) || null
  if (!movieFile) {
    const size = asNumber(pick(item, 'sizeOnDisk', 'size_on_disk'))
    if (size == null) return null
    return { name: null, size, quality: null, video: null, audio: null }
  }
  const quality = movieFile.quality as ArrLookupItem | undefined
  const qualityName = quality && typeof quality === 'object'
    ? pick((quality.quality as ArrLookupItem | undefined) || quality, 'name')
    : null
  const mediaInfo = (pick(movieFile, 'mediaInfo', 'media_info') as ArrLookupItem | undefined) || {}
  return {
    name: (pick(movieFile, 'relativePath', 'relative_path') as string | null) || null,
    size: asNumber(pick(movieFile, 'size')),
    quality: (qualityName as string | null) || null,
    video: (pick(mediaInfo, 'videoCodec', 'video_codec') as string | null) || null,
    audio: (pick(mediaInfo, 'audioCodec', 'audio_codec') as string | null) || null,
  }
}

export function fileFromSonarrLookup(item: ArrLookupItem | null): RequestInstance['file'] {
  if (!item) return null
  const stats = (pick(item, 'statistics') as ArrLookupItem | undefined) || {}
  const size = asNumber(pick(stats, 'sizeOnDisk', 'size_on_disk')) ?? asNumber(pick(item, 'sizeOnDisk', 'size_on_disk'))
  if (size == null) return null
  return { name: null, size, quality: null, video: null, audio: null }
}

export function queueProgress(item?: Pick<ServerArrQueueItem, 'size' | 'sizeLeft' | 'size_left'> | null): number {
  if (!item) return 0
  const size = Number(item.size || 0)
  const left = Number(item.sizeLeft ?? item.size_left ?? 0)
  if (size <= 0) return 0
  return Math.min(100, Math.max(0, ((size - left) / size) * 100))
}

export function matchArrQueueItem(
  records: ServerArrQueueItem[] | undefined,
  opts: { tmdbId?: string | number | null; title?: string | null },
): ServerArrQueueItem | null {
  if (!records?.length) return null
  const tmdb = opts.tmdbId != null ? String(opts.tmdbId) : ''
  if (tmdb) {
    const byId = records.find((item) => String(item.tmdbId ?? item.tmdb_id ?? '') === tmdb)
    if (byId) return byId
  }
  const title = (opts.title || '').trim().toLowerCase()
  if (!title) return null
  return records.find((item) => (item.title || '').toLowerCase().includes(title)) || null
}

export function makeServerArrInstanceId(serverId: number, arrInstanceId: string): string {
  return `${serverId}:${arrInstanceId}`
}

export function parseServerArrInstanceId(instanceId: string): { serverId: number; arrInstanceId?: string } {
  const [serverPart, arrPart] = instanceId.split(':')
  const serverId = Number(serverPart)
  return {
    serverId,
    arrInstanceId: arrPart || undefined,
  }
}

export function arrRequestErrorMessage(err: unknown, fallback = 'Failed to request'): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
    if (typeof detail === 'string' && detail.trim()) return detail
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}

export function requestWidgetFromInstances(
  pluginId: string,
  label: string,
  mediaType: 'movie' | 'show',
  mediaId: string,
  instances: RequestInstance[],
): RequestWidget {
  return {
    pluginId,
    label,
    props: { label, mediaType, mediaId, instances },
  }
}

export function instanceLabel(serverName: string, arrName: string, appLabel: string): string {
  if (!arrName || arrName.toLowerCase() === 'default') return `${serverName} ${appLabel}`
  return `${serverName} · ${arrName}`
}

export function toRequestInstance(
  id: string,
  name: string,
  status: ArrRequestStatus,
  file?: RequestInstance['file'],
): RequestInstance {
  return { id, name, status, file: file || null }
}

export { type ArrServiceInstance }
