import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CollectionSection } from '../media-collection-section'

const mockUseQuery = vi.fn()

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useQuery: (...args: any[]) => mockUseQuery(...args),
  }
})

vi.mock('@media', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useMediaParams: () => ({ mediaType: 'movie', mediaId: '101' }),
  }
})

vi.mock('@ui/molecules/media-card', () => ({
  MediaCard: (props: any) => (
    <div data-testid={`media-card-${props.id}`} className={props.className}>
      <span>{props.title}</span>
    </div>
  ),
}))

vi.mock('@ui/atoms/image', () => ({
  Image: (props: any) => <img src={props.src} alt={props.alt} />,
}))

describe('CollectionSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when data is missing or collection is null', () => {
    mockUseQuery.mockReturnValue({ data: null })
    const { container: c1 } = render(<CollectionSection />)
    expect(c1.firstChild).toBeNull()

    mockUseQuery.mockReturnValue({ data: { id: '101', collection: null } })
    const { container: c2 } = render(<CollectionSection />)
    expect(c2.firstChild).toBeNull()
  })

  it('renders nothing when movies array in collection is empty', () => {
    mockUseQuery.mockReturnValue({
      data: {
        id: '101',
        collection: {
          id: '10',
          name: 'Empty Collection',
          overview: 'Nothing here.',
          posterUrl: null,
          movies: [],
        },
      },
    })
    const { container } = render(<CollectionSection />)
    expect(container.firstChild).toBeNull()
  })

  it('renders collection header, overview, and movie cards', () => {
    mockUseQuery.mockReturnValue({
      data: {
        id: '101',
        collection: {
          id: '10',
          name: 'Star Wars Collection',
          overview: 'An epic space-opera saga.',
          posterUrl: 'https://image.tmdb.org/t/p/original/star_wars_coll.jpg',
          movies: [
            {
              id: '101',
              title: 'A New Hope',
              posterUrl: '/poster1.jpg',
              releaseDate: '1977-05-25',
              slug: 'a-new-hope',
              isAdult: false,
            },
            {
              id: '102',
              title: 'The Empire Strikes Back',
              posterUrl: '/poster2.jpg',
              releaseDate: '1980-05-21',
              slug: 'the-empire-strikes-back',
              isAdult: false,
            },
          ],
        },
      },
    })

    render(<CollectionSection />)

    expect(screen.getByText('Star Wars Collection')).toBeInTheDocument()
    expect(screen.getByText('2 films in this collection')).toBeInTheDocument()
    expect(screen.getByText('An epic space-opera saga.')).toBeInTheDocument()
    expect(screen.getByText('Franchise')).toBeInTheDocument()

    // Poster
    const posterImg = screen.getByAltText('Star Wars Collection')
    expect(posterImg).toHaveAttribute('src', 'https://image.tmdb.org/t/p/original/star_wars_coll.jpg')

    // MediaCards
    expect(screen.getByTestId('media-card-101')).toBeInTheDocument()
    expect(screen.getByTestId('media-card-101')).toHaveTextContent('A New Hope')
    expect(screen.getByTestId('media-card-102')).toBeInTheDocument()
    expect(screen.getByTestId('media-card-102')).toHaveTextContent('The Empire Strikes Back')
  })

  it('highlights current movie in collection', () => {
    mockUseQuery.mockReturnValue({
      data: {
        id: '101',
        collection: {
          id: '10',
          name: 'Star Wars Collection',
          overview: null,
          posterUrl: null,
          movies: [
            {
              id: '101',
              title: 'A New Hope',
              posterUrl: null,
              releaseDate: '1977-05-25',
              slug: 'a-new-hope',
              isAdult: false,
            },
            {
              id: '102',
              title: 'The Empire Strikes Back',
              posterUrl: null,
              releaseDate: '1980-05-21',
              slug: 'the-empire-strikes-back',
              isAdult: false,
            },
          ],
        },
      },
    })

    const { container } = render(<CollectionSection />)

    const cards = container.querySelectorAll('.shrink-0 > div:first-child')
    expect(cards[0].className).toContain('ring-primary')
    expect(cards[1].className).toContain('ring-white/10')
  })
})
