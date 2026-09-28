import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  useParams: () => ({}),
}))

import { GameCharacters } from '../game-characters'

describe('GameCharacters component', () => {
  it('renders nothing when characters list is empty or undefined', () => {
    const { container: c1 } = render(<GameCharacters characters={[]} />)
    expect(c1.firstChild).toBeNull()

    const { container: c2 } = render(<GameCharacters characters={undefined} />)
    expect(c2.firstChild).toBeNull()
  })

  it('renders character cards when characters are provided', () => {
    const mockCharacters = [
      {
        id: 'mc-1',
        order: 0,
        character: {
          id: 'char-1',
          name: 'Geralt of Rivia',
          slug: 'geralt-of-rivia',
          description: 'A mutated monster hunter.',
          gender: 'male',
          species: 'human',
          mugShotUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/geralt.jpg',
        },
      },
      {
        id: 'mc-2',
        order: 1,
        character: {
          id: 'char-2',
          name: 'Ciri',
          slug: 'ciri',
          description: 'Child of destiny.',
          gender: 'female',
          species: 'human',
          mugShotUrl: null,
        },
      },
    ]

    render(<GameCharacters characters={mockCharacters} />)

    expect(screen.getByText('Characters')).toBeDefined()
    expect(screen.getByText('Geralt of Rivia')).toBeDefined()
    expect(screen.getByText('Ciri')).toBeDefined()
  })

  it('sorts characters with images ahead of those without', () => {
    const mockCharacters = [
      {
        id: 'mc-1',
        order: 0,
        character: {
          id: 'char-1',
          name: 'No Image First',
          slug: 'no-image-first',
          mugShotUrl: null,
        },
      },
      {
        id: 'mc-2',
        order: 1,
        character: {
          id: 'char-2',
          name: 'Has Image Second',
          slug: 'has-image-second',
          mugShotUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/hero.jpg',
        },
      },
    ]

    render(<GameCharacters characters={mockCharacters} />)

    const buttons = screen.getAllByRole('button').filter((btn) =>
      /No Image First|Has Image Second/.test(btn.textContent || ''),
    )
    expect(buttons[0]?.textContent).toContain('Has Image Second')
    expect(buttons[1]?.textContent).toContain('No Image First')
  })

  it('renders safely when character objects have missing/null fields', () => {
    const brokenCharacters = [
      {
        id: 'mc-3',
        order: 0,
        character: {
          id: 'char-3',
          name: 'Unknown Entity',
          slug: 'unknown-entity',
          description: null,
          gender: null,
          species: null,
          mugShotUrl: null,
        },
      },
    ]

    expect(() => render(<GameCharacters characters={brokenCharacters} />)).not.toThrow()
    expect(screen.getByText('Unknown Entity')).toBeDefined()
  })

  it('opens character details modal when character card is clicked', () => {
    const mockCharacters = [
      {
        id: 'mc-1',
        order: 0,
        character: {
          id: 'char-1',
          name: 'Arthur Morgan',
          slug: 'arthur-morgan',
          description: 'A central member of the Van der Linde gang.',
          gender: 'male',
          species: 'human',
          mugShotUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/arthur.jpg',
        },
      },
    ]

    render(<GameCharacters characters={mockCharacters} />)

    const cardButton = screen.getByText('Arthur Morgan')
    fireEvent.click(cardButton)

    // Modal should now be open with description and link
    expect(screen.getByText('A central member of the Van der Linde gang.')).toBeDefined()
    expect(screen.getByText('View character profile')).toBeDefined()
  })
})
