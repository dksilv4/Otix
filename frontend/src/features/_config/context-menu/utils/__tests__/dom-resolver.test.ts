import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveContextMenuTarget } from '../dom-resolver'

describe('resolveContextMenuTarget', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('resolves selected text when text selection exists', () => {
    const mockSelection = {
      toString: () => '  Hello World  ',
    } as unknown as Selection

    const div = document.createElement('div')
    div.textContent = 'Hello World'
    document.body.appendChild(div)

    const resolved = resolveContextMenuTarget(div, mockSelection)
    expect(resolved).toEqual({
      type: 'text',
      text: 'Hello World',
    })
  })

  it('resolves input elements when clicking an input', () => {
    const input = document.createElement('input')
    input.value = 'test text'
    document.body.appendChild(input)

    const resolved = resolveContextMenuTarget(input, null)
    expect(resolved.type).toBe('input')
  })

  it('resolves video elements when clicking a video', () => {
    const video = document.createElement('video')
    video.src = 'https://example.com/stream.mp4'
    document.body.appendChild(video)

    const resolved = resolveContextMenuTarget(video, null)
    expect(resolved.type).toBe('video')
    if (resolved.type === 'video') {
      expect(resolved.element).toBe(video)
      expect(resolved.src).toBe('https://example.com/stream.mp4')
    }
  })

  it('resolves media elements with data-context-type="media"', () => {
    const card = document.createElement('div')
    card.setAttribute('data-context-type', 'media')
    card.setAttribute('data-media-id', 'm-123')
    card.setAttribute('data-media-type', 'movie')
    card.setAttribute('data-media-title', 'Inception')
    card.setAttribute('data-media-poster', 'https://example.com/poster.jpg')
    card.setAttribute('data-media-year', '2010')
    card.setAttribute('data-media-tmdb-id', '27205')

    const child = document.createElement('span')
    card.appendChild(child)
    document.body.appendChild(card)

    const resolved = resolveContextMenuTarget(child, null)
    expect(resolved).toEqual({
      type: 'media',
      id: 'm-123',
      mediaType: 'movie',
      title: 'Inception',
      posterUrl: 'https://example.com/poster.jpg',
      year: '2010',
      tmdbId: '27205',
    })
  })

  it('resolves game elements with data-context-type="game"', () => {
    const gameEl = document.createElement('div')
    gameEl.setAttribute('data-context-type', 'game')
    gameEl.setAttribute('data-game-id', 'game-456')
    gameEl.setAttribute('data-media-title', 'Cyberpunk 2077')
    document.body.appendChild(gameEl)

    const resolved = resolveContextMenuTarget(gameEl, null)
    expect(resolved).toEqual({
      type: 'game',
      gameId: 'game-456',
      title: 'Cyberpunk 2077',
      posterUrl: undefined,
      year: undefined,
    })
  })

  it('resolves episode elements with data-context-type="episode"', () => {
    const epEl = document.createElement('div')
    epEl.setAttribute('data-context-type', 'episode')
    epEl.setAttribute('data-episode-id', 'ep-1')
    epEl.setAttribute('data-show-id', 'show-10')
    epEl.setAttribute('data-show-title', 'Severance')
    epEl.setAttribute('data-season-number', '1')
    epEl.setAttribute('data-episode-number', '9')
    epEl.setAttribute('data-episode-title', 'The We We Are')
    epEl.setAttribute('data-episode-still', 'https://example.com/ep9.jpg')
    epEl.setAttribute('data-episode-watched', 'true')
    document.body.appendChild(epEl)

    const resolved = resolveContextMenuTarget(epEl, null)
    expect(resolved).toEqual({
      type: 'episode',
      episodeId: 'ep-1',
      showId: 'show-10',
      showTitle: 'Severance',
      seasonNumber: 1,
      episodeNumber: 9,
      title: 'The We We Are',
      stillUrl: 'https://example.com/ep9.jpg',
      isWatched: true,
    })
  })

  it('resolves season elements with data-context-type="season"', () => {
    const seasonEl = document.createElement('div')
    seasonEl.setAttribute('data-context-type', 'season')
    seasonEl.setAttribute('data-show-id', 'show-10')
    seasonEl.setAttribute('data-show-title', 'Severance')
    seasonEl.setAttribute('data-season-number', '1')
    seasonEl.setAttribute('data-season-name', 'Season 1')
    seasonEl.setAttribute('data-season-poster', 'https://example.com/s1.jpg')
    document.body.appendChild(seasonEl)

    const resolved = resolveContextMenuTarget(seasonEl, null)
    expect(resolved).toEqual({
      type: 'season',
      showId: 'show-10',
      showTitle: 'Severance',
      seasonNumber: 1,
      name: 'Season 1',
      posterUrl: 'https://example.com/s1.jpg',
      isWatched: false,
    })
  })

  it('resolves genre elements with data-context-type="genre"', () => {
    const genreEl = document.createElement('div')
    genreEl.setAttribute('data-context-type', 'genre')
    genreEl.setAttribute('data-genre-id', 'sci-fi')
    genreEl.setAttribute('data-genre-name', 'Sci-Fi')
    genreEl.setAttribute('data-genre-media-type', 'movie')
    document.body.appendChild(genreEl)

    const resolved = resolveContextMenuTarget(genreEl, null)
    expect(resolved).toEqual({
      type: 'genre',
      genreId: 'sci-fi',
      name: 'Sci-Fi',
      mediaType: 'movie',
    })
  })

  it('resolves download elements with data-context-type="download"', () => {
    const dlEl = document.createElement('div')
    dlEl.setAttribute('data-context-type', 'download')
    dlEl.setAttribute('data-download-id', 'dl-123')
    dlEl.setAttribute('data-download-title', 'Half-Life 2')
    dlEl.setAttribute('data-download-filename', 'hl2.zip')
    dlEl.setAttribute('data-download-status', 'downloading')
    dlEl.setAttribute('data-media-item-id', 'game-hl2')
    dlEl.setAttribute('data-media-type', 'game')
    document.body.appendChild(dlEl)

    const resolved = resolveContextMenuTarget(dlEl, null)
    expect(resolved).toEqual({
      type: 'download',
      downloadId: 'dl-123',
      title: 'Half-Life 2',
      filename: 'hl2.zip',
      status: 'downloading',
      mediaItemId: 'game-hl2',
      mediaType: 'game',
    })
  })

  it('resolves user elements with data-context-type="user"', () => {
    const userEl = document.createElement('div')
    userEl.setAttribute('data-context-type', 'user')
    userEl.setAttribute('data-user-id', 'u-99')
    userEl.setAttribute('data-user-username', 'diogo')
    userEl.setAttribute('data-user-avatar', 'https://example.com/avatar.jpg')
    document.body.appendChild(userEl)

    const resolved = resolveContextMenuTarget(userEl, null)
    expect(resolved).toEqual({
      type: 'user',
      userId: 'u-99',
      username: 'diogo',
      avatarUrl: 'https://example.com/avatar.jpg',
    })
  })

  it('resolves person elements with data-context-type="person"', () => {
    const personEl = document.createElement('div')
    personEl.setAttribute('data-context-type', 'person')
    personEl.setAttribute('data-person-id', 'p-789')
    personEl.setAttribute('data-person-name', 'Christopher Nolan')
    document.body.appendChild(personEl)

    const resolved = resolveContextMenuTarget(personEl, null)
    expect(resolved).toEqual({
      type: 'person',
      id: 'p-789',
      name: 'Christopher Nolan',
      image: undefined,
    })
  })

  it('resolves list elements with data-context-type="list"', () => {
    const listEl = document.createElement('div')
    listEl.setAttribute('data-context-type', 'list')
    listEl.setAttribute('data-list-id', 'list-101')
    listEl.setAttribute('data-list-name', 'Favorites')
    document.body.appendChild(listEl)

    const resolved = resolveContextMenuTarget(listEl, null)
    expect(resolved).toEqual({
      type: 'list',
      id: 'list-101',
      name: 'Favorites',
    })
  })

  it('resolves audio track elements with data-context-type="track"', () => {
    const trackEl = document.createElement('tr')
    trackEl.setAttribute('data-context-type', 'track')
    trackEl.setAttribute('data-track-id', 't-99')
    trackEl.setAttribute('data-track-title', 'Time')
    trackEl.setAttribute('data-track-artist', 'Hans Zimmer')
    document.body.appendChild(trackEl)

    const resolved = resolveContextMenuTarget(trackEl, null)
    expect(resolved).toEqual({
      type: 'track',
      id: 't-99',
      title: 'Time',
      artist: 'Hans Zimmer',
      album: undefined,
    })
  })

  it('resolves anchor tags when clicked on a link', () => {
    const link = document.createElement('a')
    link.href = 'https://example.com/about'
    link.textContent = 'About Us'
    document.body.appendChild(link)

    const resolved = resolveContextMenuTarget(link, null)
    expect(resolved.type).toBe('link')
    if (resolved.type === 'link') {
      expect(resolved.href).toBe('https://example.com/about')
      expect(resolved.text).toBe('About Us')
    }
  })

  it('resolves images when clicked on an img', () => {
    const img = document.createElement('img')
    img.src = 'https://example.com/photo.png'
    img.alt = 'A nice photo'
    document.body.appendChild(img)

    const resolved = resolveContextMenuTarget(img, null)
    expect(resolved).toEqual({
      type: 'image',
      src: 'https://example.com/photo.png',
      alt: 'A nice photo',
    })
  })

  it('falls back to page target on empty or unannotated elements', () => {
    const div = document.createElement('div')
    document.body.appendChild(div)

    const resolved = resolveContextMenuTarget(div, null)
    expect(resolved.type).toBe('page')
  })
})
