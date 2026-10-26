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
  Pause,
  Maximize2,
  Download,
  Scissors,
  Clipboard,
  CheckSquare,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RotateCcw,
  RotateCw,
  Home,
  Command,
  Globe,
  Film,
  Tv,
  Music,
  Clapperboard,
  CheckCircle2,
  Circle,
  Volume2,
  VolumeX,
  PictureInPicture2,
  Clock,
  Compass,
  MessageSquare,
  Flame,
  Gauge,
  HelpCircle,
  Trash2,
  Sparkles,
} from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { emitOtixEvent } from '@/lib/plugin-events'
import { queryClient } from '@/lib/query/client'
import { showToast, showErrorToast } from '@ui/molecules/toast'
import { openCommandPalette } from '@/features/hub/open-command-palette'
import { openQuickStream } from '@/features/media/utils/open-quick-stream'
import { AddToListModal } from '@/features/list/components/organisms/add-to-list-modal'
import { MediaScreenshotLightboxModal } from '@/features/media/components/molecules/media-screenshot-lightbox-modal'
import { ShareModal } from '@/features/list/components/molecules/list-actions'
import { EpisodeModal } from '@/features/media/show/components/organisms/media-show-episode-modal'
import { MatchReviewCenterModal } from '@/features/settings/components/organisms/match-review-center-modal'
import type { ContextMenuItemDef } from '../types'
import type {
  ResolvedMediaTarget,
  ResolvedGameTarget,
  ResolvedEpisodeTarget,
  ResolvedSeasonTarget,
  ResolvedGenreTarget,
  ResolvedDownloadTarget,
  ResolvedUserTarget,
  ResolvedVideoTarget,
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

const safeCopyMarkdownLink = (text: string, url: string) => {
  const md = `[${text}](${url})`
  return safeCopy(md, 'Copied Markdown link')
}

const safeCopyImage = async (url: string) => {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const pngBlob =
      blob.type === 'image/png'
        ? blob
        : await new Promise<Blob>((resolve, reject) => {
            const img = new window.Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => {
              const canvas = document.createElement('canvas')
              canvas.width = img.naturalWidth
              canvas.height = img.naturalHeight
              const ctx = canvas.getContext('2d')
              ctx?.drawImage(img, 0, 0)
              canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas blob failed'))), 'image/png')
            }
            img.onerror = reject
            img.src = url
          })
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
    showToast({ title: 'Image copied to clipboard', variant: 'success' })
  } catch (err) {
    showErrorToast(err, 'Failed to copy image to clipboard')
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

const toggleEpisodeWatched = async (showId: string, episodeId: string, active: boolean) => {
  try {
    if (active) {
      await apiClient.put(`/media/show/${showId}/episodes/${episodeId}/watched`, {})
    } else {
      await apiClient.delete(`/media/show/${showId}/episodes/${episodeId}/watched`)
    }
    emitOtixEvent('otix:episode:watched', { mediaId: showId, mediaType: 'show', episodeId, active })
    queryClient.invalidateQueries({ queryKey: ['episode-interactions', 'show', showId] })
    queryClient.invalidateQueries({ queryKey: ['media', 'detail'] })
    queryClient.invalidateQueries({ queryKey: ['interaction', 'show', showId] })
    showToast({ title: active ? 'Marked episode as watched' : 'Marked episode as unwatched', variant: 'success' })
  } catch (err) {
    showErrorToast(err, 'Failed to update episode')
  }
}

const toggleSeasonWatched = async (showId: string, seasonNumber: number, active: boolean) => {
  try {
    if (active) {
      await apiClient.put(`/media/show/${showId}/seasons/${seasonNumber}/watched`, {})
    } else {
      await apiClient.delete(`/media/show/${showId}/seasons/${seasonNumber}/watched`)
    }
    emitOtixEvent('otix:episode:watched', { mediaId: showId, mediaType: 'show', active, seasonNumber })
    queryClient.invalidateQueries({ queryKey: ['episode-interactions', 'show', showId] })
    queryClient.invalidateQueries({ queryKey: ['media', 'detail'] })
    queryClient.invalidateQueries({ queryKey: ['interaction', 'show', showId] })
    showToast({
      title: active ? `Marked Season ${seasonNumber} as watched` : `Marked Season ${seasonNumber} as unwatched`,
      variant: 'success',
    })
  } catch (err) {
    showErrorToast(err, 'Failed to update season')
  }
}

export const buildMediaMenuItems = (
  target: ResolvedMediaTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  const { id, mediaType, title, posterUrl } = target
  const detailPath = `/media/${mediaType}/${id}`
  const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${detailPath}` : detailPath

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
  } else {
    items.push({
      id: 'launch-in-launcher',
      label: 'Open in Game Launcher',
      icon: Gamepad2,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/launcher/$gameId', params: { gameId: id } })
        } else if (typeof window !== 'undefined') {
          window.location.href = `/launcher/${id}`
        }
      },
    })
  }

  if (mediaType === 'movie' || mediaType === 'show') {
    items.push({
      id: 'watch-trailer',
      label: 'Watch Trailer',
      icon: Clapperboard,
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' official trailer')}`, '_blank')
        }
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
        safeCopy(fullUrl, 'Copied media link')
      },
    },
    {
      id: 'copy-markdown',
      label: 'Copy Markdown Link',
      icon: Copy,
      onClick: () => {
        safeCopyMarkdownLink(title, fullUrl)
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
              ...(mediaType === 'movie'
                ? [
                    {
                      id: 'search-letterboxd',
                      label: 'Letterboxd',
                      icon: Film,
                      onClick: () =>
                        window.open(`https://letterboxd.com/search/${encodeURIComponent(title)}/`, '_blank'),
                    },
                  ]
                : []),
              {
                id: 'search-rotten',
                label: 'Rotten Tomatoes',
                icon: Flame,
                onClick: () =>
                  window.open(`https://www.rottentomatoes.com/search?search=${encodeURIComponent(title)}`, '_blank'),
              },
              ...(mediaType === 'show'
                ? [
                    {
                      id: 'search-trakt',
                      label: 'Trakt',
                      icon: Tv,
                      onClick: () =>
                        window.open(`https://trakt.tv/search/shows?query=${encodeURIComponent(title)}`, '_blank'),
                    },
                  ]
                : []),
              {
                id: 'search-justwatch',
                label: 'JustWatch (Where to Stream)',
                icon: Compass,
                onClick: () =>
                  window.open(`https://www.justwatch.com/us/search?q=${encodeURIComponent(title)}`, '_blank'),
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
                id: 'search-protondb',
                label: 'ProtonDB (Linux / Deck)',
                icon: Gamepad2,
                onClick: () =>
                  window.open(`https://www.protondb.com/search?q=${encodeURIComponent(title)}`, '_blank'),
              },
              {
                id: 'search-pcgamingwiki',
                label: 'PCGamingWiki (Fixes & FOV)',
                icon: HelpCircle,
                onClick: () =>
                  window.open(`https://www.pcgamingwiki.com/w/index.php?search=${encodeURIComponent(title)}`, '_blank'),
              },
              {
                id: 'search-steamdb',
                label: 'SteamDB',
                icon: Gamepad2,
                onClick: () =>
                  window.open(`https://steamdb.info/search/?a=app&q=${encodeURIComponent(title)}`, '_blank'),
              },
              {
                id: 'search-igdb',
                label: 'IGDB',
                icon: Gamepad2,
                onClick: () =>
                  window.open(`https://www.igdb.com/search?q=${encodeURIComponent(title)}`, '_blank'),
              },
              {
                id: 'search-howlongtobeat',
                label: 'HowLongToBeat',
                icon: Clock,
                onClick: () =>
                  window.open(`https://howlongtobeat.com/?q=${encodeURIComponent(title)}`, '_blank'),
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
              {
                id: 'search-apple',
                label: 'Apple Music',
                icon: Music,
                onClick: () =>
                  window.open(`https://music.apple.com/search?term=${encodeURIComponent(title)}`, '_blank'),
              },
              {
                id: 'search-genius',
                label: 'Genius (Lyrics)',
                icon: Music,
                onClick: () =>
                  window.open(`https://genius.com/search?q=${encodeURIComponent(title)}`, '_blank'),
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
  const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${launcherPath}` : launcherPath

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
    {
      id: 'store-details',
      label: 'Store & Media Info',
      icon: Info,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/media/$mediaType/$mediaId', params: { mediaType: 'game', mediaId: gameId } })
        } else if (typeof window !== 'undefined') {
          window.location.href = `/media/game/${gameId}`
        }
      },
    },
    { id: 'sep-library', separator: true },
    {
      id: 'fix-match',
      label: 'Fix Match / Review Candidates',
      icon: Sparkles,
      onClick: () => {
        if (context?.openModal) {
          let close: () => void = () => {}
          close = context.openModal(
            <MatchReviewCenterModal
              open={true}
              onOpenChange={(open) => {
                if (!open) close()
              }}
            />,
          )
        } else if (typeof window !== 'undefined') {
          window.location.href = '/settings/paths'
        }
      },
    },
    {
      id: 'library-submenu',
      label: 'Library & Tracking',
      icon: Bookmark,
      subItems: [
        {
          id: 'mark-played',
          label: 'Mark as Played',
          onClick: () => toggleInteraction('game', gameId, 'watched', 'Played'),
        },
        {
          id: 'add-wishlist',
          label: 'Add to Wishlist',
          onClick: () => toggleInteraction('game', gameId, 'watchlisted', 'Wishlist'),
        },
        {
          id: 'mark-owned',
          label: 'Mark as Owned',
          onClick: () => toggleInteraction('game', gameId, 'owned', 'Owned'),
        },
      ],
    },
    {
      id: 'favorite',
      label: 'Favorite Game',
      icon: Heart,
      onClick: () => toggleInteraction('game', gameId, 'liked', 'Liked'),
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
              mediaItemId={gameId}
              mediaTitle={title}
              mediaType="game"
              onClose={() => close()}
            />,
          )
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
      id: 'copy-link',
      label: 'Copy Game Link',
      icon: Share2,
      onClick: () => safeCopy(fullUrl, 'Copied game link'),
    },
    {
      id: 'copy-markdown',
      label: 'Copy Markdown Link',
      icon: Copy,
      onClick: () => safeCopyMarkdownLink(title, fullUrl),
    },
    { id: 'sep-search', separator: true },
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
    {
      id: 'game-databases',
      label: 'Databases & Guides',
      icon: Compass,
      subItems: [
        {
          id: 'search-protondb',
          label: 'ProtonDB (Linux / Deck)',
          icon: Gamepad2,
          onClick: () =>
            window.open(`https://www.protondb.com/search?q=${encodeURIComponent(title)}`, '_blank'),
        },
        {
          id: 'search-pcgamingwiki',
          label: 'PCGamingWiki (Fixes & Config)',
          icon: HelpCircle,
          onClick: () =>
            window.open(`https://www.pcgamingwiki.com/w/index.php?search=${encodeURIComponent(title)}`, '_blank'),
        },
        {
          id: 'search-steamdb',
          label: 'SteamDB',
          icon: Gamepad2,
          onClick: () =>
            window.open(`https://steamdb.info/search/?a=app&q=${encodeURIComponent(title)}`, '_blank'),
        },
        {
          id: 'search-igdb',
          label: 'IGDB',
          icon: Gamepad2,
          onClick: () =>
            window.open(`https://www.igdb.com/search?q=${encodeURIComponent(title)}`, '_blank'),
        },
        {
          id: 'search-howlongtobeat',
          label: 'HowLongToBeat',
          icon: Clock,
          onClick: () =>
            window.open(`https://howlongtobeat.com/?q=${encodeURIComponent(title)}`, '_blank'),
        },
        {
          id: 'search-youtube-gameplay',
          label: 'YouTube Gameplay',
          icon: Globe,
          onClick: () =>
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' gameplay walkthrough')}`, '_blank'),
        },
        {
          id: 'search-twitch',
          label: 'Twitch Streams',
          icon: Globe,
          onClick: () =>
            window.open(`https://www.twitch.tv/search?term=${encodeURIComponent(title)}`, '_blank'),
        },
      ],
    },
  ]
}

export const buildEpisodeMenuItems = (
  target: ResolvedEpisodeTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  const { episodeId, showId, showTitle, seasonNumber, episodeNumber, title, stillUrl, isWatched } = target
  const displayTitle = `S${seasonNumber < 10 ? `0${seasonNumber}` : seasonNumber}E${episodeNumber < 10 ? `0${episodeNumber}` : episodeNumber} - ${title}`
  const queryStr = `${showTitle ? `${showTitle} ` : ''}S${seasonNumber}E${episodeNumber} ${title}`

  return [
    {
      id: 'stream-episode',
      label: `Play Episode (${displayTitle})`,
      icon: Play,
      onClick: () => {
        openQuickStream({
          mediaId: showId,
          mediaType: 'show',
          title: showTitle || title,
        })
      },
    },
    {
      id: 'view-episode-details',
      label: 'View Episode Details',
      icon: Info,
      onClick: () => {
        if (context?.openModal) {
          let close: () => void = () => {}
          close = context.openModal(
            <EpisodeModal
              episode={
                {
                  id: episodeId,
                  episodeNumber,
                  name: title,
                  overview: '',
                  runtime: 0,
                  stillUrl: stillUrl || null,
                  airDate: null,
                  voteAverage: null,
                } as any
              }
              sourceRect={null}
              showId={showId}
              showTitle={showTitle}
              seasonNumber={seasonNumber}
              onClose={() => close()}
            />,
          )
        }
      },
    },
    { id: 'sep-tracking', separator: true },
    {
      id: 'toggle-watched',
      label: isWatched ? 'Mark as Unwatched' : 'Mark as Watched',
      icon: isWatched ? Circle : CheckCircle2,
      onClick: () => toggleEpisodeWatched(showId, episodeId, !isWatched),
    },
    { id: 'sep-copy', separator: true },
    {
      id: 'copy-title',
      label: 'Copy Episode Title',
      icon: Copy,
      onClick: () => safeCopy(displayTitle, 'Copied episode title'),
    },
    {
      id: 'copy-name',
      label: 'Copy Title Only',
      icon: Copy,
      onClick: () => safeCopy(title, 'Copied title'),
    },
    ...(stillUrl
      ? [
          {
            id: 'view-still',
            label: 'View Episode Still',
            icon: Maximize2,
            onClick: () => {
              if (context?.openModal) {
                let close: () => void = () => {}
                close = context.openModal(
                  <MediaScreenshotLightboxModal
                    screenshots={[{ url: stillUrl }]}
                    onClose={() => close()}
                  />,
                )
              }
            },
          },
        ]
      : []),
    { id: 'sep-search', separator: true },
    {
      id: 'search-episode',
      label: 'Search Episode On...',
      icon: Search,
      subItems: [
        {
          id: 'search-tmdb',
          label: 'The Movie Database (TMDb)',
          icon: Film,
          onClick: () =>
            window.open(`https://www.themoviedb.org/search?query=${encodeURIComponent(queryStr)}`, '_blank'),
        },
        {
          id: 'search-imdb',
          label: 'IMDb',
          icon: Tv,
          onClick: () =>
            window.open(`https://www.imdb.com/find?q=${encodeURIComponent(queryStr)}`, '_blank'),
        },
        {
          id: 'search-youtube',
          label: 'YouTube',
          icon: Globe,
          onClick: () =>
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(queryStr)}`, '_blank'),
        },
        {
          id: 'search-google',
          label: 'Google Search',
          icon: Globe,
          onClick: () =>
            window.open(`https://www.google.com/search?q=${encodeURIComponent(queryStr)}`, '_blank'),
        },
      ],
    },
  ]
}

export const buildSeasonMenuItems = (
  target: ResolvedSeasonTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  const { showId, showTitle, seasonNumber, name, posterUrl } = target
  const seasonPath = `/media/show/${showId}`
  const displayName = showTitle ? `${showTitle} - ${name}` : name

  return [
    {
      id: 'play-season',
      label: `Play Season ${seasonNumber}`,
      icon: Play,
      onClick: () => {
        openQuickStream({
          mediaId: showId,
          mediaType: 'show',
          title: showTitle || name,
        })
      },
    },
    {
      id: 'view-season',
      label: `View ${name}`,
      icon: Info,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/media/$mediaType/$mediaId', params: { mediaType: 'show', mediaId: showId }, search: { season: seasonNumber } })
        } else if (typeof window !== 'undefined') {
          window.location.href = `${seasonPath}?season=${seasonNumber}`
        }
      },
    },
    {
      id: 'open-new-tab',
      label: 'Open in New Tab',
      icon: ExternalLink,
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(`${seasonPath}?season=${seasonNumber}`, '_blank')
        }
      },
    },
    { id: 'sep-tracking', separator: true },
    {
      id: 'mark-season-watched',
      label: 'Mark All as Watched',
      icon: CheckCircle2,
      onClick: () => toggleSeasonWatched(showId, seasonNumber, true),
    },
    {
      id: 'mark-season-unwatched',
      label: 'Mark All as Unwatched',
      icon: Circle,
      onClick: () => toggleSeasonWatched(showId, seasonNumber, false),
    },
    { id: 'sep-copy', separator: true },
    {
      id: 'copy-title',
      label: 'Copy Season Name',
      icon: Copy,
      onClick: () => safeCopy(displayName, 'Copied season name'),
    },
    ...(posterUrl
      ? [
          {
            id: 'view-poster',
            label: 'View Season Poster',
            icon: Maximize2,
            onClick: () => {
              if (context?.openModal) {
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
    { id: 'sep-search', separator: true },
    {
      id: 'search-tmdb',
      label: 'Search Season on TMDb',
      icon: Film,
      onClick: () =>
        window.open(`https://www.themoviedb.org/search?query=${encodeURIComponent(displayName)}`, '_blank'),
    },
    {
      id: 'search-google',
      label: 'Search on Google',
      icon: Globe,
      onClick: () =>
        window.open(`https://www.google.com/search?q=${encodeURIComponent(displayName)}`, '_blank'),
    },
  ]
}

export const buildGenreMenuItems = (
  target: ResolvedGenreTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  const { genreId, name, mediaType } = target
  const genrePath = `/genre/${genreId}`
  const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${genrePath}` : genrePath

  return [
    {
      id: 'view-genre',
      label: `Explore ${name}`,
      icon: Compass,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/genre/$genreId', params: { genreId }, search: mediaType ? { type: mediaType } : undefined })
        } else if (typeof window !== 'undefined') {
          window.location.href = genrePath
        }
      },
    },
    {
      id: 'open-new-tab',
      label: 'Open in New Tab',
      icon: ExternalLink,
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(genrePath, '_blank')
        }
      },
    },
    { id: 'sep-filters', separator: true },
    {
      id: 'filter-movies',
      label: 'Filter Movies',
      icon: Film,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/genre/$genreId', params: { genreId }, search: { type: 'movie' } })
        } else if (typeof window !== 'undefined') {
          window.location.href = `${genrePath}?type=movie`
        }
      },
    },
    {
      id: 'filter-shows',
      label: 'Filter TV Shows',
      icon: Tv,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/genre/$genreId', params: { genreId }, search: { type: 'show' } })
        } else if (typeof window !== 'undefined') {
          window.location.href = `${genrePath}?type=show`
        }
      },
    },
    {
      id: 'filter-games',
      label: 'Filter Games',
      icon: Gamepad2,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/genre/$genreId', params: { genreId }, search: { type: 'game' } })
        } else if (typeof window !== 'undefined') {
          window.location.href = `${genrePath}?type=game`
        }
      },
    },
    { id: 'sep-copy', separator: true },
    {
      id: 'copy-name',
      label: 'Copy Genre Name',
      icon: Copy,
      onClick: () => safeCopy(name, 'Copied genre name'),
    },
    {
      id: 'copy-link',
      label: 'Copy Genre Link',
      icon: Share2,
      onClick: () => safeCopy(fullUrl, 'Copied genre link'),
    },
    {
      id: 'copy-markdown',
      label: 'Copy Markdown Link',
      icon: Copy,
      onClick: () => safeCopyMarkdownLink(name, fullUrl),
    },
  ]
}

export const buildDownloadMenuItems = (
  target: ResolvedDownloadTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  const { downloadId, title, filename, status, mediaItemId, mediaType } = target
  const isDownloading = status === 'downloading'
  const isPaused = status === 'paused'

  return [
    ...(isDownloading
      ? [
          {
            id: 'pause-download',
            label: 'Pause Download',
            icon: Pause,
            onClick: () => {
              showToast({ title: 'Paused download', description: title, variant: 'info' })
            },
          },
        ]
      : []),
    ...(isPaused
      ? [
          {
            id: 'resume-download',
            label: 'Resume Download',
            icon: Play,
            onClick: () => {
              showToast({ title: 'Resumed download', description: title, variant: 'info' })
            },
          },
        ]
      : []),
    ...(mediaItemId
      ? [
          {
            id: 'view-media',
            label: 'View Media Details',
            icon: Info,
            onClick: () => {
              if (context?.navigate) {
                context.navigate({
                  to: '/media/$mediaType/$mediaId',
                  params: { mediaType: mediaType || 'game', mediaId: mediaItemId },
                })
              }
            },
          },
        ]
      : []),
    { id: 'sep-copy', separator: true },
    {
      id: 'copy-title',
      label: 'Copy Title',
      icon: Copy,
      onClick: () => safeCopy(title, 'Copied title'),
    },
    ...(filename
      ? [
          {
            id: 'copy-filename',
            label: 'Copy Filename',
            icon: Copy,
            onClick: () => safeCopy(filename, 'Copied filename'),
          },
        ]
      : []),
    { id: 'sep-search', separator: true },
    {
      id: 'search-steam',
      label: 'Search on Steam',
      icon: Gamepad2,
      onClick: () =>
        window.open(`https://store.steampowered.com/search/?term=${encodeURIComponent(title)}`, '_blank'),
    },
    {
      id: 'search-google',
      label: 'Search on Google',
      icon: Globe,
      onClick: () =>
        window.open(`https://www.google.com/search?q=${encodeURIComponent(title)}`, '_blank'),
    },
    { id: 'sep-danger', separator: true },
    {
      id: 'cancel-download',
      label: 'Cancel / Remove Download',
      icon: Trash2,
      destructive: true,
      onClick: () => {
        showToast({ title: 'Download removed', description: title, variant: 'info' })
      },
    },
  ]
}

export const buildUserMenuItems = (
  target: ResolvedUserTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  const { username, avatarUrl } = target
  const profilePath = `/u/${username}`
  const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${profilePath}` : profilePath

  return [
    {
      id: 'view-profile',
      label: `View Profile @${username}`,
      icon: UserRound,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/u/$username', params: { username } })
        } else if (typeof window !== 'undefined') {
          window.location.href = profilePath
        }
      },
    },
    {
      id: 'open-new-tab',
      label: 'Open Profile in New Tab',
      icon: ExternalLink,
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(profilePath, '_blank')
        }
      },
    },
    {
      id: 'send-message',
      label: 'Send Message / Chat',
      icon: MessageSquare,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/chat' })
        }
      },
    },
    { id: 'sep-copy', separator: true },
    {
      id: 'copy-username',
      label: 'Copy Username',
      icon: Copy,
      onClick: () => safeCopy(`@${username}`, 'Copied username'),
    },
    {
      id: 'copy-link',
      label: 'Copy Profile Link',
      icon: Share2,
      onClick: () => safeCopy(fullUrl, 'Copied profile link'),
    },
    {
      id: 'copy-markdown',
      label: 'Copy Markdown Link',
      icon: Copy,
      onClick: () => safeCopyMarkdownLink(`@${username}`, fullUrl),
    },
    ...(avatarUrl
      ? [
          {
            id: 'view-avatar',
            label: 'View Avatar',
            icon: Maximize2,
            onClick: () => {
              if (context?.openModal) {
                let close: () => void = () => {}
                close = context.openModal(
                  <MediaScreenshotLightboxModal
                    screenshots={[{ url: avatarUrl }]}
                    onClose={() => close()}
                  />,
                )
              }
            },
          },
        ]
      : []),
  ]
}

export const buildVideoMenuItems = (
  target: ResolvedVideoTarget,
): ContextMenuItemDef[] => {
  const { element, src, paused, muted } = target
  const currentSpeed = element.playbackRate || 1

  return [
    {
      id: 'video-play-pause',
      label: paused ? 'Play' : 'Pause',
      icon: paused ? Play : Pause,
      onClick: () => {
        if (element.paused) {
          element.play().catch(() => {})
        } else {
          element.pause()
        }
      },
    },
    {
      id: 'video-mute',
      label: muted ? 'Unmute' : 'Mute',
      icon: muted ? Volume2 : VolumeX,
      onClick: () => {
        element.muted = !element.muted
      },
    },
    {
      id: 'video-pip',
      label: typeof document !== 'undefined' && document.pictureInPictureElement ? 'Exit Picture in Picture' : 'Picture in Picture',
      icon: PictureInPicture2,
      onClick: async () => {
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture()
          } else if (document.pictureInPictureEnabled) {
            await element.requestPictureInPicture()
          }
        } catch (err) {
          showErrorToast(err, 'PiP not supported')
        }
      },
    },
    {
      id: 'video-fullscreen',
      label: typeof document !== 'undefined' && document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen',
      icon: Maximize2,
      shortcut: 'F',
      onClick: async () => {
        try {
          if (document.fullscreenElement) {
            await document.exitFullscreen()
          } else {
            await (element.requestFullscreen?.() ?? element.parentElement?.requestFullscreen?.())
          }
        } catch (err) {
          showErrorToast(err, 'Fullscreen error')
        }
      },
    },
    { id: 'sep-controls', separator: true },
    {
      id: 'video-speed-menu',
      label: 'Playback Speed',
      icon: Gauge,
      subItems: [0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => ({
        id: `speed-${rate}`,
        label: rate === 1 ? '1x (Normal)' : `${rate}x`,
        checked: currentSpeed === rate,
        onClick: () => {
          element.playbackRate = rate
          showToast({ title: `Playback speed set to ${rate}x`, variant: 'info' })
        },
      })),
    },
    {
      id: 'video-loop',
      label: element.loop ? 'Loop: On' : 'Loop: Off',
      icon: RotateCw,
      checked: element.loop,
      onClick: () => {
        element.loop = !element.loop
        showToast({ title: element.loop ? 'Loop enabled' : 'Loop disabled', variant: 'info' })
      },
    },
    { id: 'sep-copy', separator: true },
    {
      id: 'video-timestamp',
      label: 'Copy Current Timestamp',
      icon: Clock,
      onClick: () => {
        const cur = Math.floor(element.currentTime || 0)
        const m = Math.floor(cur / 60)
        const s = cur % 60
        const formatted = `${m}:${s < 10 ? '0' : ''}${s}`
        safeCopy(formatted, 'Copied video timestamp')
      },
    },
    ...(src
      ? [
          {
            id: 'video-copy-url',
            label: 'Copy Video Address',
            icon: Copy,
            onClick: () => safeCopy(src, 'Copied video address'),
          },
        ]
      : []),
  ]
}

export const buildPersonMenuItems = (
  target: ResolvedPersonTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  const { id, name, image } = target
  const personPath = `/person/${id}`
  const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${personPath}` : personPath

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
    {
      id: 'search-otix',
      label: `Search ${name} in Otix`,
      icon: Search,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/search', search: { q: name } })
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
        safeCopy(fullUrl, 'Copied profile link')
      },
    },
    {
      id: 'copy-markdown',
      label: 'Copy Markdown Link',
      icon: Copy,
      onClick: () => safeCopyMarkdownLink(name, fullUrl),
    },
    ...(image
      ? [
          {
            id: 'view-photo',
            label: 'View Profile Photo',
            icon: Maximize2,
            onClick: () => {
              if (context?.openModal) {
                let close: () => void = () => {}
                close = context.openModal(
                  <MediaScreenshotLightboxModal
                    screenshots={[{ url: image }]}
                    onClose={() => close()}
                  />,
                )
              }
            },
          },
        ]
      : []),
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
      id: 'search-wikipedia',
      label: 'Search Wikipedia',
      icon: Globe,
      onClick: () =>
        window.open(`https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`, '_blank'),
    },
    {
      id: 'search-youtube',
      label: 'Search Interviews on YouTube',
      icon: Globe,
      onClick: () =>
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' interview')}`, '_blank'),
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
  const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${listPath}` : listPath

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
    {
      id: 'share-list',
      label: 'Share List...',
      icon: Share2,
      onClick: () => {
        if (context?.openModal) {
          let close: () => void = () => {}
          close = context.openModal(
            <ShareModal
              list={
                {
                  id,
                  name,
                  isPublic: true,
                  itemCount: 0,
                } as any
              }
              onClose={() => close()}
            />,
          )
        }
      },
    },
    {
      id: 'search-otix',
      label: `Search "${name}" in Otix`,
      icon: Search,
      onClick: () => {
        if (context?.navigate) {
          context.navigate({ to: '/search', search: { q: name } })
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
        safeCopy(fullUrl, 'Copied list link')
      },
    },
    {
      id: 'copy-markdown',
      label: 'Copy Markdown Link',
      icon: Copy,
      onClick: () => safeCopyMarkdownLink(name, fullUrl),
    },
  ]
}

export const buildTrackMenuItems = (
  target: ResolvedTrackTarget,
  context?: MenuBuilderContext,
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
    ...(artist
      ? [
          {
            id: 'search-artist',
            label: `Search Artist "${artist}" in Otix`,
            icon: Search,
            onClick: () => {
              if (context?.navigate) {
                context.navigate({ to: '/search', search: { q: artist } })
              }
            },
          },
        ]
      : []),
    { id: 'sep-copy', separator: true },
    {
      id: 'copy-title',
      label: 'Copy Title',
      icon: Copy,
      onClick: () => safeCopy(displayTitle, 'Copied track title'),
    },
    {
      id: 'copy-track-name',
      label: 'Copy Song Name Only',
      icon: Copy,
      onClick: () => safeCopy(title, 'Copied song title'),
    },
    { id: 'sep-external', separator: true },
    {
      id: 'search-spotify',
      label: 'Search on Spotify',
      icon: Music,
      onClick: () =>
        window.open(`https://open.spotify.com/search/${encodeURIComponent(displayTitle)}`, '_blank'),
    },
    {
      id: 'search-apple',
      label: 'Search on Apple Music',
      icon: Music,
      onClick: () =>
        window.open(`https://music.apple.com/search?term=${encodeURIComponent(displayTitle)}`, '_blank'),
    },
    {
      id: 'search-genius',
      label: 'Search Lyrics on Genius',
      icon: Music,
      onClick: () =>
        window.open(`https://genius.com/search?q=${encodeURIComponent(displayTitle)}`, '_blank'),
    },
    {
      id: 'search-youtube',
      label: 'Search on YouTube',
      icon: Globe,
      onClick: () =>
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(displayTitle)}`, '_blank'),
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
          {
            id: 'copy-markdown',
            label: 'Copy Link as Markdown',
            icon: Copy,
            onClick: () => safeCopyMarkdownLink(text, href),
          },
          { id: 'sep-search', separator: true },
          {
            id: 'search-text',
            label: `Search Google for "${text.length > 25 ? `${text.slice(0, 22)}...` : text}"`,
            icon: Globe,
            onClick: () =>
              window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, '_blank'),
          },
        ]
      : []),
  ]
}

export const buildImageMenuItems = (
  target: ResolvedImageTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  const { src, alt } = target

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
      id: 'copy-image',
      label: 'Copy Image to Clipboard',
      icon: Clipboard,
      onClick: () => safeCopyImage(src),
    },
    {
      id: 'copy-url',
      label: 'Copy Image Address',
      icon: Copy,
      onClick: () => safeCopy(src, 'Copied image address'),
    },
    {
      id: 'copy-markdown',
      label: 'Copy Image Markdown',
      icon: Copy,
      onClick: () => safeCopy(`![${alt || 'Image'}](${src})`, 'Copied image markdown'),
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
    { id: 'sep-search', separator: true },
    {
      id: 'search-lens',
      label: 'Search with Google Lens',
      icon: Search,
      onClick: () =>
        window.open(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(src)}`, '_blank'),
    },
  ]
}

export const buildTextMenuItems = (
  target: ResolvedTextTarget,
  context?: MenuBuilderContext,
): ContextMenuItemDef[] => {
  const { text } = target
  const displaySnippet = text.length > 25 ? `${text.slice(0, 22)}...` : text
  const isUrl = /^https?:\/\/\S+$/i.test(text.trim())

  return [
    {
      id: 'copy-text',
      label: 'Copy',
      icon: Copy,
      shortcut: 'Ctrl+C',
      onClick: () => safeCopy(text, 'Copied text'),
    },
    {
      id: 'copy-quoted',
      label: 'Copy as Quoted Text',
      icon: Copy,
      onClick: () => safeCopy(`"${text}"`, 'Copied quoted text'),
    },
    { id: 'sep-search', separator: true },
    ...(isUrl
      ? [
          {
            id: 'open-url',
            label: `Open URL: ${displaySnippet}`,
            icon: ExternalLink,
            onClick: () => {
              if (typeof window !== 'undefined') {
                window.open(text.trim(), '_blank')
              }
            },
          },
        ]
      : []),
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
    {
      id: 'search-youtube',
      label: `Search YouTube for "${displaySnippet}"`,
      icon: Globe,
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(text)}`, '_blank')
        }
      },
    },
    {
      id: 'search-wikipedia',
      label: `Search Wikipedia for "${displaySnippet}"`,
      icon: Globe,
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(`https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(text)}`, '_blank')
        }
      },
    },
    {
      id: 'translate',
      label: 'Translate with Google',
      icon: Globe,
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(`https://translate.google.com/?text=${encodeURIComponent(text)}`, '_blank')
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
    {
      id: 'clear',
      label: 'Clear Field',
      icon: Trash2,
      disabled: !el.value,
      onClick: () => {
        el.value = ''
        el.dispatchEvent(new Event('input', { bubbles: true }))
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
  const currentUrl = typeof window !== 'undefined' ? window.location.href : ''
  const currentTitle = typeof document !== 'undefined' ? document.title : ''

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
    { id: 'sep-page-view', separator: true },
    {
      id: 'scroll-top',
      label: 'Scroll to Top',
      icon: ArrowUp,
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      },
    },
    {
      id: 'toggle-fullscreen',
      label: typeof document !== 'undefined' && document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen',
      icon: Maximize2,
      shortcut: 'F11',
      onClick: async () => {
        try {
          if (document.fullscreenElement) {
            await document.exitFullscreen()
          } else {
            await document.documentElement.requestFullscreen()
          }
        } catch (err) {
          showErrorToast(err, 'Fullscreen error')
        }
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
        safeCopy(currentUrl, 'Copied page URL')
      },
    },
    {
      id: 'copy-markdown',
      label: 'Copy Page as Markdown Link',
      icon: Copy,
      onClick: () => {
        safeCopyMarkdownLink(currentTitle || 'Page', currentUrl)
      },
    },
  ]
}
