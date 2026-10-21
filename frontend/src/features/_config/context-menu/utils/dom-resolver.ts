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

  // 3. Check for annotated semantic data-context-type
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
        title: contextEl.dataset.mediaTitle || '',
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

  // 4. Check for anchor link (outside a media card)
  const anchorEl = target.closest<HTMLAnchorElement>('a[href]')
  if (anchorEl && anchorEl.href) {
    return {
      type: 'link',
      href: anchorEl.href,
      text: anchorEl.textContent?.trim() || undefined,
    }
  }

  // 5. Check for standalone image
  const imgEl = target.closest<HTMLImageElement>('img[src]')
  if (imgEl && imgEl.src) {
    return {
      type: 'image',
      src: imgEl.currentSrc || imgEl.src,
      alt: imgEl.alt || undefined,
    }
  }

  // 6. Generic page fallback
  return {
    type: 'page',
    url: typeof window !== 'undefined' ? window.location.href : '',
    title: typeof document !== 'undefined' ? document.title : '',
  }
}
