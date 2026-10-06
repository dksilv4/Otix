import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GenreCard } from '../genre-card'
import { getGenreVisual, DEFAULT_VISUAL } from '../../visual'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, search, ...props }: any) => {
    let href = to
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        href = href.replace(`$${key}`, value)
      }
    }
    if (search?.type) {
      href += `?type=${search.type}`
    }
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
}))

describe('GenreCard', () => {
  it('renders genre name and destination link', () => {
    render(
      <GenreCard
        genre={{ id: 28, name: 'Action', slug: 'action' }}
      />,
    )

    expect(screen.getByText('Action')).toBeDefined()
    expect(screen.getByText('Explore collection')).toBeDefined()

    const link = screen.getByRole('link', { name: /Explore Action genre/i })
    expect(link.getAttribute('href')).toBe('/genre/action')
  })

  it('renders mediaType label and query parameter when mediaType is passed', () => {
    render(
      <GenreCard
        genre={{ id: 12, name: 'Role-Playing (RPG)', slug: 'role-playing-rpg' }}
        mediaType="game"
      />,
    )

    expect(screen.getByText('Games')).toBeDefined()
    const link = screen.getByRole('link', { name: /Explore Role-Playing \(RPG\) genre/i })
    expect(link.getAttribute('href')).toBe('/genre/role-playing-rpg?type=game')
  })

  it('resolves TV, gaming, and music visuals via getGenreVisual', () => {
    // TMDB TV genre with ampersand
    const tvAction = getGenreVisual('Action & Adventure')
    expect(tvAction.accentColor).toBe('#f97316')

    // TMDB TV Sci-Fi & Fantasy
    const tvSciFi = getGenreVisual('Sci-Fi & Fantasy')
    expect(tvSciFi.accentColor).toBe('#06b6d4')

    // Game Strategy
    const gameStrategy = getGenreVisual('strategy')
    expect(gameStrategy.accentColor).toBe('#3b82f6')

    // Game Racing
    const gameRacing = getGenreVisual('racing')
    expect(gameRacing.accentColor).toBe('#f97316')

    // Music Pop
    const musicPop = getGenreVisual('pop')
    expect(musicPop.accentColor).toBe('#ec4899')

    // Unknown fallback
    const unknown = getGenreVisual('totally-nonexistent-genre-xyz')
    expect(unknown).toEqual(DEFAULT_VISUAL)
  })
})
