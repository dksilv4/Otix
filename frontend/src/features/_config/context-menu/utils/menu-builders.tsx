import type { ReactNode } from 'react'
import {
  Info,
  ExternalLink,
  Bookmark,
  Heart,
  FolderPlus,
  Copy,
  Share2,
  Search,
  Gamepad2,
  UserRound,
  List,
  Play,
  Maximize2,
  Download,
  Scissors,
  Clipboard,
  CheckSquare,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Home,
  Command,
  Globe,
  Film,
  Tv,
  Music,
} from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { emitOtixEvent } from '@/lib/plugin-events'
import { queryClient } from '@/lib/query/client'
import { showToast, showErrorToast } from '@ui/molecules/toast'
import { openCommandPalette } from '@/features/hub/open-command-palette'
import { openQuickStream } from '@/features/media/utils/open-quick-stream'
import { AddToListModal } from '@/features/list/components/organisms/add-to-list-modal'
import { MediaScreenshotLightboxModal } from '@/features/media/components/molecules/media-screenshot-lightbox-modal'
import type { ContextMenuItemDef } from '../types'
import type {
  ResolvedMediaTarget,
  ResolvedGameTarget,
  ResolvedPersonTarget,
  ResolvedListTarget,
  ResolvedTrackTarget,
  ResolvedLinkTarget,
  ResolvedImageTarget,
  ResolvedTextTarget,
  ResolvedInputTarget,
  ResolvedPageTarget,
} from './dom-resolver'

export interface MenuBuilderContext {
  navigate?: (opts: { to: string; params?: Record<string, string>; search?: Record<string, unknown> }) => void
  openModal?: (node: ReactNode) => () => void
}

const safeCopy = async (text: string, title = 'Copied to clipboard') => {
  try {
    await navigator.clipboard.writeText(text)
    showToast({ title, description: text.length > 60 ? `${text.slice(0, 57)}...` : text, variant: 'success' })
  } catch (err) {
    showErrorToast(err, 'Failed to copy')
  }
}

const toggleInteraction = async (
  mediaType: string,
  mediaId: string,
  type: string,
  label: string,
) => {
  try {
    await apiClient.put(`/media/${mediaType}/${mediaId}/interactions/${type}`, {})
    emitOtixEvent('otix:media:interaction', { type, mediaId, mediaType, active: true })
    if (type === 'watchlisted') {
      emitOtixEvent('otix:list:item_added', {
        listId: 'watchlist',
        item: { mediaItemId: mediaId, mediaType },
      })
    }
    queryClient.invalidateQueries({ queryKey: ['interaction', mediaType, mediaId] })
    queryClient.invalidateQueries({ queryKey: ['media', 'detail', mediaType, mediaId] })
    queryClient.invalidateQueries({ queryKey: ['media', 'list'] })
    queryClient.invalidateQueries({ queryKey: ['library'] })
    showToast({ title: `Marked as ${label}`, variant: 'success' })
  } catch (err) {
    showErrorToast(err, `Failed to update ${label}`)
  }
}

export const buildMediaMenuItems = (
  target: ResolvedMediaTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  const { id, mediaType, title, posterUrl } = target
  const detailPath = `/media/${mediaType}/${id}`

  const watchedLabel =
    mediaType === 'game' ? 'Played' : mediaType === 'music' ? 'Listened' : 'Watched'
  const watchlistLabel = mediaType === 'game' ? 'Wishlist' : 'Watchlist'

  const items: ContextMenuItemDef[] = []

  if (mediaType !== 'game') {
    items.push({
      id: 'stream-in-otix',
      label: 'Stream in Otix',
      icon: Play,
      onClick: () => {
        openQuickStream({
          mediaId: id,
          tmdbId: target.tmdbId,
          mediaType,
          title,
        })
      },
    })
  }

  items.push(
    {
      id: 'view-details',
      label: 'View Details',
      icon: Info,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/media/$mediaType/$mediaId', params: { mediaType, mediaId: id } })
        } else if (typeof window !== 'undefined') {
          window.location.href = detailPath
        }
      },
    },
    {
      id: 'open-new-tab',
      label: 'Open in New Tab',
      icon: ExternalLink,
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(detailPath, '_blank')
        }
      },
    },
    { id: 'sep-tracking', separator: true },
    {
      id: 'library-submenu',
      label: 'Add to Library',
      icon: Bookmark,
      subItems: [
        {
          id: 'mark-watched',
          label: `Mark as ${watchedLabel}`,
          onClick: () => toggleInteraction(mediaType, id, 'watched', watchedLabel),
        },
        {
          id: 'add-watchlist',
          label: `Add to ${watchlistLabel}`,
          onClick: () => toggleInteraction(mediaType, id, 'watchlisted', watchlistLabel),
        },
        {
          id: 'mark-owned',
          label: 'Mark as Owned',
          onClick: () => toggleInteraction(mediaType, id, 'owned', 'Owned'),
        },
      ],
    },
    {
      id: 'favorite',
      label: 'Favorite / Like',
      icon: Heart,
      onClick: () => toggleInteraction(mediaType, id, 'liked', 'Liked'),
    },
    {
      id: 'add-to-list',
      label: 'Add to List...',
      icon: FolderPlus,
      onClick: () => {
        if (context?.openModal) {
          let close: () => void = () => {}
          close = context.openModal(
            <AddToListModal
              mediaItemId={id}
              mediaTitle={title}
              mediaType={mediaType}
              onClose={() => close()}
            />,
          )
        }
      },
    },
    { id: 'sep-share', separator: true },
    {
      id: 'copy-title',
      label: 'Copy Title',
      icon: Copy,
      onClick: () => safeCopy(title, 'Copied title'),
    },
    {
      id: 'copy-link',
      label: 'Copy Link',
      icon: Share2,
      onClick: () => {
        const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${detailPath}` : detailPath
        safeCopy(fullUrl, 'Copied media link')
      },
    },
    ...(posterUrl
      ? [
          {
            id: 'view-poster',
            label: 'View Poster Art',
            icon: Maximize2,
            onClick: () => {
              if (context?.openModal && posterUrl) {
                let close: () => void = () => {}
                close = context.openModal(
                  <MediaScreenshotLightboxModal
                    screenshots={[{ url: posterUrl }]}
                    onClose={() => close()}
                  />,
                )
              }
            },
          },
        ]
      : []),
    { id: 'sep-external', separator: true },
    {
      id: 'external-search',
      label: 'Search On...',
      icon: Search,
      subItems: [
        ...(mediaType === 'movie' || mediaType === 'show'
          ? [
              {
                id: 'search-tmdb',
                label: 'The Movie Database (TMDb)',
                icon: Film,
                onClick: () =>
                  window.open(`https://www.themoviedb.org/search?query=${encodeURIComponent(title)}`, '_blank'),
              },
              {
                id: 'search-imdb',
                label: 'IMDb',
                icon: Tv,
                onClick: () =>
                  window.open(`https://www.imdb.com/find?q=${encodeURIComponent(title)}`, '_blank'),
              },
            ]
          : []),
        ...(mediaType === 'game'
          ? [
              {
                id: 'search-steam',
                label: 'Steam Store',
                icon: Gamepad2,
                onClick: () =>
                  window.open(`https://store.steampowered.com/search/?term=${encodeURIComponent(title)}`, '_blank'),
              },
              {
                id: 'search-igdb',
                label: 'IGDB',
                icon: Gamepad2,
                onClick: () =>
                  window.open(`https://www.igdb.com/search?q=${encodeURIComponent(title)}`, '_blank'),
              },
            ]
          : []),
        ...(mediaType === 'music'
          ? [
              {
                id: 'search-spotify',
                label: 'Spotify',
                icon: Music,
                onClick: () =>
                  window.open(`https://open.spotify.com/search/${encodeURIComponent(title)}`, '_blank'),
              },
            ]
          : []),
        {
          id: 'search-youtube',
          label: 'YouTube',
          icon: Globe,
          onClick: () =>
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`, '_blank'),
        },
        {
          id: 'search-google',
          label: 'Google Search',
          icon: Globe,
          onClick: () =>
            window.open(`https://www.google.com/search?q=${encodeURIComponent(title)}`, '_blank'),
        },
      ],
    },
  )
  return items
}

export const buildGameMenuItems = (
  target: ResolvedGameTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  const { gameId, title } = target
  const launcherPath = `/launcher/${gameId}`

  return [
    {
      id: 'game-details',
      label: 'Game Details',
      icon: Gamepad2,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/launcher/$gameId', params: { gameId } })
        } else if (typeof window !== 'undefined') {
          window.location.href = launcherPath
        }
      },
    },
    {
      id: 'open-new-tab',
      label: 'Open in New Tab',
      icon: ExternalLink,
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(launcherPath, '_blank')
        }
      },
    },
    { id: 'sep-copy', separator: true },
    {
      id: 'copy-title',
      label: 'Copy Title',
      icon: Copy,
      onClick: () => safeCopy(title, 'Copied game title'),
    },
    {
      id: 'search-steam',
      label: 'Search on Steam',
      icon: Search,
      onClick: () =>
        window.open(`https://store.steampowered.com/search/?term=${encodeURIComponent(title)}`, '_blank'),
    },
    {
      id: 'search-google',
      label: 'Search on Google',
      icon: Globe,
      onClick: () =>
        window.open(`https://www.google.com/search?q=${encodeURIComponent(title + ' game')}`, '_blank'),
    },
  ]
}

export const buildPersonMenuItems = (
  target: ResolvedPersonTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  const { id, name } = target
  const personPath = `/person/${id}`

  return [
    {
      id: 'view-person',
      label: `View ${name}`,
      icon: UserRound,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/person/$personId', params: { personId: id } })
        } else if (typeof window !== 'undefined') {
          window.location.href = personPath
        }
      },
    },
    {
      id: 'open-new-tab',
      label: 'Open in New Tab',
      icon: ExternalLink,
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(personPath, '_blank')
        }
      },
    },
    { id: 'sep-copy', separator: true },
    {
      id: 'copy-name',
      label: 'Copy Name',
      icon: Copy,
      onClick: () => safeCopy(name, 'Copied person name'),
    },
    {
      id: 'copy-link',
      label: 'Copy Profile Link',
      icon: Share2,
      onClick: () => {
        const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${personPath}` : personPath
        safeCopy(fullUrl, 'Copied profile link')
      },
    },
    { id: 'sep-search', separator: true },
    {
      id: 'search-tmdb',
      label: 'Search TMDb',
      icon: Film,
      onClick: () =>
        window.open(`https://www.themoviedb.org/search/person?query=${encodeURIComponent(name)}`, '_blank'),
    },
    {
      id: 'search-imdb',
      label: 'Search IMDb',
      icon: Tv,
      onClick: () =>
        window.open(`https://www.imdb.com/find?q=${encodeURIComponent(name)}&s=nm`, '_blank'),
    },
    {
      id: 'search-google',
      label: 'Search Google',
      icon: Globe,
      onClick: () =>
        window.open(`https://www.google.com/search?q=${encodeURIComponent(name)}`, '_blank'),
    },
  ]
}

export const buildListMenuItems = (
  target: ResolvedListTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  const { id, name } = target
  const listPath = `/library/${id}`

  return [
    {
      id: 'view-list',
      label: `Open List "${name}"`,
      icon: List,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/library/$listId', params: { listId: id } })
        } else if (typeof window !== 'undefined') {
          window.location.href = listPath
        }
      },
    },
    {
      id: 'open-new-tab',
      label: 'Open in New Tab',
      icon: ExternalLink,
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(listPath, '_blank')
        }
      },
    },
    { id: 'sep-copy', separator: true },
    {
      id: 'copy-name',
      label: 'Copy List Name',
      icon: Copy,
      onClick: () => safeCopy(name, 'Copied list name'),
    },
    {
      id: 'copy-link',
      label: 'Copy List Link',
      icon: Share2,
      onClick: () => {
        const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${listPath}` : listPath
        safeCopy(fullUrl, 'Copied list link')
      },
    },
  ]
}

export const buildTrackMenuItems = (
  target: ResolvedTrackTarget,
): ContextMenuItemDef[] => {
  const { title, artist } = target
  const displayTitle = artist ? `${artist} - ${title}` : title

  return [
    {
      id: 'play-track',
      label: 'Play Track',
      icon: Play,
      onClick: () => {
        showToast({ title: 'Playing Track', description: displayTitle, variant: 'info' })
      },
    },
    { id: 'sep-copy', separator: true },
    {
      id: 'copy-title',
      label: 'Copy Title',
      icon: Copy,
      onClick: () => safeCopy(displayTitle, 'Copied track title'),
    },
    {
      id: 'search-youtube',
      label: 'Search on YouTube',
      icon: Globe,
      onClick: () =>
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(displayTitle)}`, '_blank'),
    },
    {
      id: 'search-spotify',
      label: 'Search on Spotify',
      icon: Music,
      onClick: () =>
        window.open(`https://open.spotify.com/search/${encodeURIComponent(displayTitle)}`, '_blank'),
    },
  ]
}

export const buildLinkMenuItems = (
  target: ResolvedLinkTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  const { href, text } = target
  const isInternal = href.startsWith('/') || (typeof window !== 'undefined' && href.startsWith(window.location.origin))

  return [
    {
      id: 'open-link',
      label: 'Open Link',
      icon: ExternalLink,
      onClick: () => {
        if (isInternal && context?.navigate) {
          const path = href.replace(window.location.origin, '')
          context.navigate({ to: path })
        } else if (typeof window !== 'undefined') {
          window.location.href = href
        }
      },
    },
    {
      id: 'open-new-tab',
      label: 'Open in New Tab',
      icon: ExternalLink,
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(href, '_blank')
        }
      },
    },
    { id: 'sep-copy', separator: true },
    {
      id: 'copy-link',
      label: 'Copy Link Address',
      icon: Copy,
      onClick: () => safeCopy(href, 'Copied link address'),
    },
    ...(text
      ? [
          {
            id: 'copy-text',
            label: 'Copy Link Text',
            icon: Copy,
            onClick: () => safeCopy(text, 'Copied text'),
          },
        ]
      : []),
  ]
}

export const buildImageMenuItems = (
  target: ResolvedImageTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  const { src } = target

  return [
    {
      id: 'view-image',
      label: 'View Full Image',
      icon: Maximize2,
      onClick: () => {
        if (context?.openModal) {
          let close: () => void = () => {}
          close = context.openModal(
            <MediaScreenshotLightboxModal
              screenshots={[{ url: src }]}
              onClose={() => close()}
            />,
          )
        }
      },
    },
    {
      id: 'open-new-tab',
      label: 'Open Image in New Tab',
      icon: ExternalLink,
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(src, '_blank')
        }
      },
    },
    { id: 'sep-copy', separator: true },
    {
      id: 'copy-url',
      label: 'Copy Image Address',
      icon: Copy,
      onClick: () => safeCopy(src, 'Copied image address'),
    },
    {
      id: 'download-image',
      label: 'Download Image',
      icon: Download,
      onClick: () => {
        const a = document.createElement('a')
        a.href = src
        a.download = src.split('/').pop()?.split('?')[0] || 'otix-image.jpg'
        a.target = '_blank'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      },
    },
  ]
}

export const buildTextMenuItems = (
  target: ResolvedTextTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  const { text } = target
  const displaySnippet = text.length > 25 ? `${text.slice(0, 22)}...` : text

  return [
    {
      id: 'copy-text',
      label: 'Copy',
      icon: Copy,
      shortcut: 'Ctrl+C',
      onClick: () => safeCopy(text, 'Copied text'),
    },
    { id: 'sep-search', separator: true },
    {
      id: 'search-otix',
      label: `Search Otix for "${displaySnippet}"`,
      icon: Search,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/search', search: { q: text } })
        }
      },
    },
    {
      id: 'search-google',
      label: `Search Google for "${displaySnippet}"`,
      icon: Globe,
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, '_blank')
        }
      },
    },
  ]
}

export const buildInputMenuItems = (
  target: ResolvedInputTarget,
): ContextMenuItemDef[] => {
  const el = target.element as HTMLInputElement | HTMLTextAreaElement

  return [
    {
      id: 'cut',
      label: 'Cut',
      icon: Scissors,
      shortcut: 'Ctrl+X',
      onClick: () => {
        const sel = el.value?.slice(el.selectionStart || 0, el.selectionEnd || 0)
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => {})
          const start = el.selectionStart || 0
          const end = el.selectionEnd || 0
          el.value = el.value.slice(0, start) + el.value.slice(end)
          el.setSelectionRange(start, start)
        }
      },
    },
    {
      id: 'copy',
      label: 'Copy',
      icon: Copy,
      shortcut: 'Ctrl+C',
      onClick: () => {
        const sel = el.value?.slice(el.selectionStart || 0, el.selectionEnd || 0)
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => {})
        }
      },
    },
    {
      id: 'paste',
      label: 'Paste',
      icon: Clipboard,
      shortcut: 'Ctrl+V',
      onClick: async () => {
        try {
          const clip = await navigator.clipboard.readText()
          if (clip) {
            const start = el.selectionStart || 0
            const end = el.selectionEnd || 0
            el.value = el.value.slice(0, start) + clip + el.value.slice(end)
            el.setSelectionRange(start + clip.length, start + clip.length)
          }
        } catch {
          // Clipboard read may be blocked by browser permission
        }
      },
    },
    { id: 'sep-all', separator: true },
    {
      id: 'select-all',
      label: 'Select All',
      icon: CheckSquare,
      shortcut: 'Ctrl+A',
      onClick: () => {
        if (typeof el.select === 'function') {
          el.select()
        }
      },
    },
  ]
}

export const buildPageMenuItems = (
  _target: ResolvedPageTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  return [
    {
      id: 'history-back',
      label: 'Back',
      icon: ArrowLeft,
      shortcut: 'Alt+←',
      onClick: () => {
        if (typeof window !== 'undefined') window.history.back()
      },
    },
    {
      id: 'history-forward',
      label: 'Forward',
      icon: ArrowRight,
      shortcut: 'Alt+→',
      onClick: () => {
        if (typeof window !== 'undefined') window.history.forward()
      },
    },
    {
      id: 'reload-page',
      label: 'Reload',
      icon: RotateCcw,
      shortcut: 'Ctrl+R',
      onClick: () => {
        if (typeof window !== 'undefined') window.location.reload()
      },
    },
    { id: 'sep-nav', separator: true },
    {
      id: 'go-home',
      label: 'Home',
      icon: Home,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/' })
        } else if (typeof window !== 'undefined') {
          window.location.href = '/'
        }
      },
    },
    {
      id: 'command-palette',
      label: 'Command Palette',
      icon: Command,
      shortcut: 'Ctrl+K',
      onClick: () => openCommandPalette(),
    },
    { id: 'sep-copy-url', separator: true },
    {
      id: 'copy-url',
      label: 'Copy Page URL',
      icon: Copy,
      onClick: () => {
        if (typeof window !== 'undefined') {
          safeCopy(window.location.href, 'Copied page URL')
        }
      },
    },
  ]
}
