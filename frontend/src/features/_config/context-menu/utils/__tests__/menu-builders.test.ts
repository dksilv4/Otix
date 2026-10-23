import { describe, it, expect, vi } from 'vitest'
import {
  buildMediaMenuItems,
  buildGameMenuItems,
  buildEpisodeMenuItems,
  buildSeasonMenuItems,
  buildGenreMenuItems,
  buildDownloadMenuItems,
  buildUserMenuItems,
  buildVideoMenuItems,
  buildPersonMenuItems,
  buildListMenuItems,
  buildTrackMenuItems,
  buildLinkMenuItems,
  buildImageMenuItems,
  buildTextMenuItems,
  buildInputMenuItems,
  buildPageMenuItems,
} from '../menu-builders'

describe('menu-builders', () => {
  it('buildMediaMenuItems creates full set of media actions including trailer and markdown', () => {
    const navigate = vi.fn()
    const items = buildMediaMenuItems(
      {
        type: 'media',
        id: '123',
        mediaType: 'movie',
        title: 'Interstellar',
        posterUrl: 'https://example.com/poster.jpg',
      },
      { navigate },
    )

    const ids = items.map((i) => i.id)
    expect(ids).toContain('stream-in-otix')
    expect(ids).toContain('watch-trailer')
    expect(ids).toContain('view-details')
    expect(ids).toContain('open-new-tab')
    expect(ids).toContain('library-submenu')
    expect(ids).toContain('favorite')
    expect(ids).toContain('add-to-list')
    expect(ids).toContain('copy-title')
    expect(ids).toContain('copy-link')
    expect(ids).toContain('copy-markdown')
    expect(ids).toContain('view-poster')
    expect(ids).toContain('external-search')

    // Click view details
    const viewDetails = items.find((i) => i.id === 'view-details')
    viewDetails?.onClick?.()
    expect(navigate).toHaveBeenCalledWith({
      to: '/media/$mediaType/$mediaId',
      params: { mediaType: 'movie', mediaId: '123' },
    })
  })

  it('buildGameMenuItems creates game launcher actions with database guides', () => {
    const navigate = vi.fn()
    const items = buildGameMenuItems(
      {
        type: 'game',
        gameId: 'g-1',
        title: 'Hades',
      },
      { navigate },
    )

    const ids = items.map((i) => i.id)
    expect(ids).toContain('game-details')
    expect(ids).toContain('open-new-tab')
    expect(ids).toContain('store-details')
    expect(ids).toContain('library-submenu')
    expect(ids).toContain('copy-title')
    expect(ids).toContain('copy-link')
    expect(ids).toContain('copy-markdown')
    expect(ids).toContain('search-steam')
    expect(ids).toContain('search-google')
    expect(ids).toContain('game-databases')

    const details = items.find((i) => i.id === 'game-details')
    details?.onClick?.()
    expect(navigate).toHaveBeenCalledWith({
      to: '/launcher/$gameId',
      params: { gameId: 'g-1' },
    })
  })

  it('buildEpisodeMenuItems creates episode streaming, tracking, and details actions', () => {
    const openModal = vi.fn()
    const items = buildEpisodeMenuItems(
      {
        type: 'episode',
        episodeId: 'ep-9',
        showId: 's-10',
        showTitle: 'Severance',
        seasonNumber: 1,
        episodeNumber: 9,
        title: 'The We We Are',
        stillUrl: 'https://example.com/still.jpg',
        isWatched: false,
      },
      { openModal },
    )

    const ids = items.map((i) => i.id)
    expect(ids).toContain('stream-episode')
    expect(ids).toContain('view-episode-details')
    expect(ids).toContain('toggle-watched')
    expect(ids).toContain('copy-title')
    expect(ids).toContain('copy-name')
    expect(ids).toContain('view-still')
    expect(ids).toContain('search-episode')

    const toggle = items.find((i) => i.id === 'toggle-watched')
    expect(toggle?.label).toBe('Mark as Watched')
  })

  it('buildSeasonMenuItems creates season playback, tracking, and view actions', () => {
    const navigate = vi.fn()
    const items = buildSeasonMenuItems(
      {
        type: 'season',
        showId: 's-10',
        showTitle: 'Severance',
        seasonNumber: 1,
        name: 'Season 1',
        posterUrl: 'https://example.com/s1.jpg',
      },
      { navigate },
    )

    const ids = items.map((i) => i.id)
    expect(ids).toContain('play-season')
    expect(ids).toContain('view-season')
    expect(ids).toContain('open-new-tab')
    expect(ids).toContain('mark-season-watched')
    expect(ids).toContain('mark-season-unwatched')
    expect(ids).toContain('copy-title')
    expect(ids).toContain('view-poster')
    expect(ids).toContain('search-tmdb')
    expect(ids).toContain('search-google')

    const view = items.find((i) => i.id === 'view-season')
    view?.onClick?.()
    expect(navigate).toHaveBeenCalledWith({
      to: '/media/$mediaType/$mediaId',
      params: { mediaType: 'show', mediaId: 's-10' },
      search: { season: 1 },
    })
  })

  it('buildGenreMenuItems creates genre exploration and media filter actions', () => {
    const navigate = vi.fn()
    const items = buildGenreMenuItems(
      {
        type: 'genre',
        genreId: 'cyberpunk',
        name: 'Cyberpunk',
      },
      { navigate },
    )

    const ids = items.map((i) => i.id)
    expect(ids).toContain('view-genre')
    expect(ids).toContain('open-new-tab')
    expect(ids).toContain('filter-movies')
    expect(ids).toContain('filter-shows')
    expect(ids).toContain('filter-games')
    expect(ids).toContain('copy-name')
    expect(ids).toContain('copy-link')
    expect(ids).toContain('copy-markdown')

    const filterMovies = items.find((i) => i.id === 'filter-movies')
    filterMovies?.onClick?.()
    expect(navigate).toHaveBeenCalledWith({
      to: '/genre/$genreId',
      params: { genreId: 'cyberpunk' },
      search: { type: 'movie' },
    })
  })

  it('buildDownloadMenuItems creates pause/resume and management actions', () => {
    const itemsDownloading = buildDownloadMenuItems({
      type: 'download',
      downloadId: 'dl-1',
      title: 'Portal 2',
      filename: 'portal2.iso',
      status: 'downloading',
      mediaItemId: 'game-p2',
    })

    const idsDownloading = itemsDownloading.map((i) => i.id)
    expect(idsDownloading).toContain('pause-download')
    expect(idsDownloading).toContain('view-media')
    expect(idsDownloading).toContain('copy-title')
    expect(idsDownloading).toContain('copy-filename')
    expect(idsDownloading).toContain('search-steam')
    expect(idsDownloading).toContain('cancel-download')

    const itemsPaused = buildDownloadMenuItems({
      type: 'download',
      downloadId: 'dl-2',
      title: 'Portal 2',
      status: 'paused',
    })
    expect(itemsPaused.map((i) => i.id)).toContain('resume-download')
  })

  it('buildUserMenuItems creates user profile, chat, and copy actions', () => {
    const navigate = vi.fn()
    const items = buildUserMenuItems(
      {
        type: 'user',
        userId: 'u-1',
        username: 'alice',
        avatarUrl: 'https://example.com/avatar.jpg',
      },
      { navigate },
    )

    const ids = items.map((i) => i.id)
    expect(ids).toContain('view-profile')
    expect(ids).toContain('open-new-tab')
    expect(ids).toContain('send-message')
    expect(ids).toContain('copy-username')
    expect(ids).toContain('copy-link')
    expect(ids).toContain('copy-markdown')
    expect(ids).toContain('view-avatar')

    const chat = items.find((i) => i.id === 'send-message')
    chat?.onClick?.()
    expect(navigate).toHaveBeenCalledWith({ to: '/chat' })
  })

  it('buildVideoMenuItems creates video playback, audio, speed, and pip actions', () => {
    const video = document.createElement('video')
    const items = buildVideoMenuItems({
      type: 'video',
      element: video,
      paused: true,
      muted: false,
      src: 'https://example.com/video.mp4',
    })

    const ids = items.map((i) => i.id)
    expect(ids).toContain('video-play-pause')
    expect(ids).toContain('video-mute')
    expect(ids).toContain('video-pip')
    expect(ids).toContain('video-fullscreen')
    expect(ids).toContain('video-speed-menu')
    expect(ids).toContain('video-loop')
    expect(ids).toContain('video-timestamp')
    expect(ids).toContain('video-copy-url')

    const playPause = items.find((i) => i.id === 'video-play-pause')
    expect(playPause?.label).toBe('Play')
  })

  it('buildPersonMenuItems creates person actions with Otix search and wikipedia', () => {
    const navigate = vi.fn()
    const items = buildPersonMenuItems(
      {
        type: 'person',
        id: 'p-1',
        name: 'Cillian Murphy',
      },
      { navigate },
    )

    const ids = items.map((i) => i.id)
    expect(ids).toContain('view-person')
    expect(ids).toContain('open-new-tab')
    expect(ids).toContain('search-otix')
    expect(ids).toContain('copy-name')
    expect(ids).toContain('copy-link')
    expect(ids).toContain('copy-markdown')
    expect(ids).toContain('search-tmdb')
    expect(ids).toContain('search-wikipedia')

    const view = items.find((i) => i.id === 'view-person')
    view?.onClick?.()
    expect(navigate).toHaveBeenCalledWith({
      to: '/person/$personId',
      params: { personId: 'p-1' },
    })
  })

  it('buildListMenuItems creates user list actions with share modal', () => {
    const navigate = vi.fn()
    const openModal = vi.fn()
    const items = buildListMenuItems(
      {
        type: 'list',
        id: 'l-1',
        name: 'Top Sci-Fi',
      },
      { navigate, openModal },
    )

    const ids = items.map((i) => i.id)
    expect(ids).toContain('view-list')
    expect(ids).toContain('open-new-tab')
    expect(ids).toContain('share-list')
    expect(ids).toContain('search-otix')
    expect(ids).toContain('copy-name')
    expect(ids).toContain('copy-link')
    expect(ids).toContain('copy-markdown')

    const share = items.find((i) => i.id === 'share-list')
    share?.onClick?.()
    expect(openModal).toHaveBeenCalledOnce()
  })

  it('buildTrackMenuItems creates audio track actions with music databases', () => {
    const items = buildTrackMenuItems({
      type: 'track',
      id: 't-1',
      title: 'Cornfield Chase',
      artist: 'Hans Zimmer',
    })

    const ids = items.map((i) => i.id)
    expect(ids).toContain('play-track')
    expect(ids).toContain('search-artist')
    expect(ids).toContain('copy-title')
    expect(ids).toContain('copy-track-name')
    expect(ids).toContain('search-youtube')
    expect(ids).toContain('search-spotify')
    expect(ids).toContain('search-apple')
    expect(ids).toContain('search-genius')
  })

  it('buildLinkMenuItems creates link actions with markdown and search', () => {
    const items = buildLinkMenuItems({
      type: 'link',
      href: 'https://otix.tv/docs',
      text: 'Documentation',
    })

    const ids = items.map((i) => i.id)
    expect(ids).toContain('open-link')
    expect(ids).toContain('open-new-tab')
    expect(ids).toContain('copy-link')
    expect(ids).toContain('copy-text')
    expect(ids).toContain('copy-markdown')
    expect(ids).toContain('search-text')
  })

  it('buildImageMenuItems creates image actions with lens and markdown', () => {
    const items = buildImageMenuItems({
      type: 'image',
      src: 'https://example.com/banner.jpg',
      alt: 'Banner',
    })

    const ids = items.map((i) => i.id)
    expect(ids).toContain('view-image')
    expect(ids).toContain('open-new-tab')
    expect(ids).toContain('copy-image')
    expect(ids).toContain('copy-url')
    expect(ids).toContain('copy-markdown')
    expect(ids).toContain('download-image')
    expect(ids).toContain('search-lens')
  })

  it('buildTextMenuItems creates text selection actions with quoted copy and translate', () => {
    const navigate = vi.fn()
    const items = buildTextMenuItems(
      {
        type: 'text',
        text: 'Dune Part Two',
      },
      { navigate },
    )

    const ids = items.map((i) => i.id)
    expect(ids).toContain('copy-text')
    expect(ids).toContain('copy-quoted')
    expect(ids).toContain('search-otix')
    expect(ids).toContain('search-google')
    expect(ids).toContain('search-youtube')
    expect(ids).toContain('search-wikipedia')
    expect(ids).toContain('translate')

    const searchOtix = items.find((i) => i.id === 'search-otix')
    searchOtix?.onClick?.()
    expect(navigate).toHaveBeenCalledWith({
      to: '/search',
      search: { q: 'Dune Part Two' },
    })
  })

  it('buildInputMenuItems creates clipboard and clear actions', () => {
    const input = document.createElement('input')
    input.value = 'hello'
    const items = buildInputMenuItems({
      type: 'input',
      element: input,
    })

    const ids = items.map((i) => i.id)
    expect(ids).toContain('cut')
    expect(ids).toContain('copy')
    expect(ids).toContain('paste')
    expect(ids).toContain('clear')
    expect(ids).toContain('select-all')

    const clear = items.find((i) => i.id === 'clear')
    expect(clear?.disabled).toBe(false)
  })

  it('buildPageMenuItems creates fallback navigation and page actions', () => {
    const navigate = vi.fn()
    const items = buildPageMenuItems(
      {
        type: 'page',
        url: 'https://otix.tv/settings',
        title: 'Settings',
      },
      { navigate },
    )

    const ids = items.map((i) => i.id)
    expect(ids).toContain('history-back')
    expect(ids).toContain('history-forward')
    expect(ids).toContain('reload-page')
    expect(ids).toContain('scroll-top')
    expect(ids).toContain('toggle-fullscreen')
    expect(ids).toContain('go-home')
    expect(ids).toContain('command-palette')
    expect(ids).toContain('copy-url')
    expect(ids).toContain('copy-markdown')
  })
})
