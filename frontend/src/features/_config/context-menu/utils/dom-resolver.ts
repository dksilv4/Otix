import type { ContextMenuTargetType, ContextMenuMediaType } from '../types'

export interface ResolvedMediaTarget {
  type: 'media'
  id: string
  mediaType: ContextMenuMediaType
  title: string
  posterUrl?: string
  year?: string
  tmdbId?: string
}

export interface ResolvedGameTarget {
  type: 'game'
  gameId: string
  title: string
  posterUrl?: string
  year?: string
}

export interface ResolvedEpisodeTarget {
  type: 'episode'
  episodeId: string
  showId: string
  showTitle?: string
  seasonNumber: number
  episodeNumber: number
  title: string
  stillUrl?: string
  isWatched?: boolean
}

export interface ResolvedSeasonTarget {
  type: 'season'
  showId: string
  showTitle?: string
  seasonNumber: number
  name: string
  posterUrl?: string
  isWatched?: boolean
}

export interface ResolvedGenreTarget {
  type: 'genre'
  genreId: string
  name: string
  mediaType?: 'movie' | 'show' | 'game' | 'music'
}

export interface ResolvedDownloadTarget {
  type: 'download'
  downloadId: string
  title: string
  filename?: string
  status: string
  mediaItemId?: string
  mediaType?: string
}

export interface ResolvedUserTarget {
  type: 'user'
  userId?: string
  username: string
  avatarUrl?: string
}

export interface ResolvedVideoTarget {
  type: 'video'
  element: HTMLVideoElement
  src?: string
  currentTime?: number
  duration?: number
  paused?: boolean
  muted?: boolean
}

export interface ResolvedPersonTarget {
  type: 'person'
  id: string
  name: string
  image?: string
}

export interface ResolvedListTarget {
  type: 'list'
  id: string
  name: string
}

export interface ResolvedTrackTarget {
  type: 'track'
  id: string
  title: string
  artist?: string
  album?: string
}

export interface ResolvedLinkTarget {
  type: 'link'
  href: string
  text?: string
}

export interface ResolvedImageTarget {
  type: 'image'
  src: string
  alt?: string
}

export interface ResolvedTextTarget {
  type: 'text'
  text: string
}

export interface ResolvedInputTarget {
  type: 'input'
  element: HTMLElement
}

export interface ResolvedPageTarget {
  type: 'page'
  url: string
  title: string
}

export type ContextMenuResolvedTarget =
  | ResolvedMediaTarget
  | ResolvedGameTarget
  | ResolvedEpisodeTarget
  | ResolvedSeasonTarget
  | ResolvedGenreTarget
  | ResolvedDownloadTarget
  | ResolvedUserTarget
  | ResolvedVideoTarget
  | ResolvedPersonTarget
  | ResolvedListTarget
  | ResolvedTrackTarget
  | ResolvedLinkTarget
  | ResolvedImageTarget
  | ResolvedTextTarget
  | ResolvedInputTarget
  | ResolvedPageTarget

export const resolveContextMenuTarget = (
  target: HTMLElement | null,
  selection?: Selection | null,
): ContextMenuResolvedTarget => {
  // 1. Check for text selection
  const sel = selection ?? (typeof window !== 'undefined' ? window.getSelection() : null)
  const selectedText = sel ? sel.toString().trim() : ''
  if (selectedText.length > 0) {
    return { type: 'text', text: selectedText }
  }

  if (!target) {
    return {
      type: 'page',
      url: typeof window !== 'undefined' ? window.location.href : '',
      title: typeof document !== 'undefined' ? document.title : '',
    }
  }

  // 2. Check for form input or editable
  const inputEl = target.closest<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea, [contenteditable="true"]',
  )
  if (inputEl) {
    return { type: 'input', element: inputEl }
  }

  // 3. Check for HTML video
  const videoEl = target.closest<HTMLVideoElement>('video')
  if (videoEl) {
    return {
      type: 'video',
      element: videoEl,
      src: videoEl.currentSrc || videoEl.src,
      currentTime: videoEl.currentTime,
      duration: videoEl.duration,
      paused: videoEl.paused,
      muted: videoEl.muted,
    }
  }

  // 4. Check for annotated semantic data-context-type
  const contextEl = target.closest<HTMLElement>('[data-context-type]')
  if (contextEl && contextEl.dataset) {
    const rawType = contextEl.dataset.contextType as ContextMenuTargetType

    if (rawType === 'media') {
      return {
        type: 'media',
        id: contextEl.dataset.mediaId || '',
        mediaType: (contextEl.dataset.mediaType as ContextMenuMediaType) || 'movie',
        title: contextEl.dataset.mediaTitle || '',
        posterUrl: contextEl.dataset.mediaPoster,
        year: contextEl.dataset.mediaYear,
        tmdbId: contextEl.dataset.mediaTmdbId,
      }
    }

    if (rawType === 'game') {
      return {
        type: 'game',
        gameId: contextEl.dataset.gameId || '',
        title: contextEl.dataset.mediaTitle || contextEl.dataset.gameTitle || '',
        posterUrl: contextEl.dataset.mediaPoster,
        year: contextEl.dataset.mediaYear,
      }
    }

    if (rawType === 'episode') {
      return {
        type: 'episode',
        episodeId: contextEl.dataset.episodeId || '',
        showId: contextEl.dataset.showId || '',
        showTitle: contextEl.dataset.showTitle,
        seasonNumber: Number(contextEl.dataset.seasonNumber) || 1,
        episodeNumber: Number(contextEl.dataset.episodeNumber) || 1,
        title: contextEl.dataset.episodeTitle || `Episode ${contextEl.dataset.episodeNumber || ''}`,
        stillUrl: contextEl.dataset.episodeStill,
        isWatched: contextEl.dataset.episodeWatched === 'true',
      }
    }

    if (rawType === 'season') {
      return {
        type: 'season',
        showId: contextEl.dataset.showId || '',
        showTitle: contextEl.dataset.showTitle,
        seasonNumber: Number(contextEl.dataset.seasonNumber) || 0,
        name: contextEl.dataset.seasonName || `Season ${contextEl.dataset.seasonNumber || ''}`,
        posterUrl: contextEl.dataset.seasonPoster,
        isWatched: contextEl.dataset.seasonWatched === 'true',
      }
    }

    if (rawType === 'genre') {
      return {
        type: 'genre',
        genreId: contextEl.dataset.genreId || '',
        name: contextEl.dataset.genreName || '',
        mediaType: contextEl.dataset.genreMediaType as any,
      }
    }

    if (rawType === 'download') {
      return {
        type: 'download',
        downloadId: contextEl.dataset.downloadId || '',
        title: contextEl.dataset.downloadTitle || '',
        filename: contextEl.dataset.downloadFilename,
        status: contextEl.dataset.downloadStatus || 'downloading',
        mediaItemId: contextEl.dataset.mediaItemId,
        mediaType: contextEl.dataset.mediaType,
      }
    }

    if (rawType === 'user') {
      return {
        type: 'user',
        userId: contextEl.dataset.userId,
        username: contextEl.dataset.userUsername || '',
        avatarUrl: contextEl.dataset.userAvatar,
      }
    }

    if (rawType === 'person') {
      return {
        type: 'person',
        id: contextEl.dataset.personId || '',
        name: contextEl.dataset.personName || '',
        image: contextEl.dataset.personImage,
      }
    }

    if (rawType === 'list') {
      return {
        type: 'list',
        id: contextEl.dataset.listId || '',
        name: contextEl.dataset.listName || '',
      }
    }

    if (rawType === 'track') {
      return {
        type: 'track',
        id: contextEl.dataset.trackId || '',
        title: contextEl.dataset.trackTitle || '',
        artist: contextEl.dataset.trackArtist,
        album: contextEl.dataset.trackAlbum,
      }
    }
  }

  // 5. Check for anchor link (outside a media card)
  const anchorEl = target.closest<HTMLAnchorElement>('a[href]')
  if (anchorEl && anchorEl.href) {
    return {
      type: 'link',
      href: anchorEl.href,
      text: anchorEl.textContent?.trim() || undefined,
    }
  }

  // 6. Check for standalone image
  const imgEl = target.closest<HTMLImageElement>('img[src]')
  if (imgEl && imgEl.src) {
    return {
      type: 'image',
      src: imgEl.currentSrc || imgEl.src,
      alt: imgEl.alt || undefined,
    }
  }

  // 7. Generic page fallback
  return {
    type: 'page',
    url: typeof window !== 'undefined' ? window.location.href : '',
    title: typeof document !== 'undefined' ? document.title : '',
  }
}
