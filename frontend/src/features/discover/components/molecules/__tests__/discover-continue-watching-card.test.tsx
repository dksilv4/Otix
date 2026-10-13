import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiscoverContinueWatchingCard } from '../discover-continue-watching-card'
import type { DiscoverContinueWatchingItem } from '../../../types'

// Mock tanstack router Link
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, _to, params, ...props }: any) => (
    <a href={`/${params?.mediaType}/${params?.mediaId}`} {...props}>
      {children}
    </a>
  ),
}))

describe('DiscoverContinueWatchingCard', () => {
  const mockShowItem: DiscoverContinueWatchingItem = {
    id: '101',
    ratingKey: '101',
    grandparentRatingKey: '100',
    mediaItemId: 42,
    mediaType: 'show',
    title: 'Severance',
    episodeTitle: 'The You You Are',
    seasonNumber: 1,
    episodeNumber: 4,
    viewOffset: 1800000,
    duration: 3600000,
    progressPercent: 50.0,
    thumb: 'http://example.com/ep.jpg',
  }

  const mockMovieItem: DiscoverContinueWatchingItem = {
    id: '202',
    ratingKey: '202',
    mediaType: 'movie',
    title: 'Interstellar',
    year: 2014,
    viewOffset: 3600000,
    duration: 10800000,
    progressPercent: 33.3,
    backdropUrl: 'http://example.com/movie.jpg',
  }

  it('renders show details, episode badge, remaining time and progress bar', () => {
    const onPlay = vi.fn()
    render(<DiscoverContinueWatchingCard item={mockShowItem} onPlay={onPlay} />)

    expect(screen.getByText('Severance')).toBeInTheDocument()
    expect(screen.getByText('S1:E4 · The You You Are')).toBeInTheDocument()
    expect(screen.getByText('S1:E4')).toBeInTheDocument()
    expect(screen.getByText('30m left')).toBeInTheDocument()

    const progressBar = screen.getByTestId('discover-continue-watching-progress')
    expect(progressBar).toBeInTheDocument()
    const fill = progressBar.firstElementChild as HTMLElement
    expect(fill).toHaveStyle({ width: '50%' })
  })

  it('renders movie details without episode badge', () => {
    const onPlay = vi.fn()
    render(<DiscoverContinueWatchingCard item={mockMovieItem} onPlay={onPlay} />)

    expect(screen.getByText('Interstellar')).toBeInTheDocument()
    expect(screen.getByText('2014')).toBeInTheDocument()
    expect(screen.queryByText(/^S\d+:E\d+/)).not.toBeInTheDocument()
  })

  it('calls onPlay when the play button is clicked', () => {
    const onPlay = vi.fn()
    render(<DiscoverContinueWatchingCard item={mockShowItem} onPlay={onPlay} />)

    const playBtn = screen.getByLabelText('Continue watching Severance')
    fireEvent.click(playBtn)
    expect(onPlay).toHaveBeenCalledWith(mockShowItem)
  })

  it('renders detail link when mediaItemId is present', () => {
    const onPlay = vi.fn()
    const { container } = render(
      <DiscoverContinueWatchingCard item={mockShowItem} onPlay={onPlay} />,
    )

    const link = container.querySelector('a')
    expect(link).toHaveAttribute('href', '/show/42')
  })

  it('triggers onPlay when clicking card without mediaItemId', () => {
    const onPlay = vi.fn()
    const itemWithoutMediaId: DiscoverContinueWatchingItem = {
      ...mockMovieItem,
      mediaItemId: undefined,
    }
    render(<DiscoverContinueWatchingCard item={itemWithoutMediaId} onPlay={onPlay} />)

    const card = screen.getByTestId('discover-continue-watching-card')
    fireEvent.click(card)
    expect(onPlay).toHaveBeenCalledWith(itemWithoutMediaId)
  })

  it('does not render progress bar or remaining time for non-started next up item', () => {
    const onPlay = vi.fn()
    const nextUpItem: DiscoverContinueWatchingItem = {
      id: '102',
      ratingKey: '102',
      mediaType: 'show',
      title: 'Severance',
      episodeTitle: 'Defiant Jazz',
      seasonNumber: 1,
      episodeNumber: 7,
      viewOffset: 0,
      duration: 3600000,
      progressPercent: 0,
    }

    render(<DiscoverContinueWatchingCard item={nextUpItem} onPlay={onPlay} />)

    expect(screen.getByText('Severance')).toBeInTheDocument()
    expect(screen.getByText('S1:E7 · Defiant Jazz')).toBeInTheDocument()
    expect(screen.getByText('S1:E7')).toBeInTheDocument()
    expect(screen.queryByTestId('discover-continue-watching-progress')).not.toBeInTheDocument()
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument()
  })
})
