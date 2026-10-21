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
