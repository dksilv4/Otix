import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MediaShowEpisodeCard } from '../media-show-episode-card'
import type { EpisodeOut, SeasonOut } from '@media/queries/media-queries'

describe('MediaShowEpisodeCard', () => {
  const mockEpisode: EpisodeOut = {
    id: 'ep-1',
    episodeNumber: 1,
    name: 'Winter Is Coming',
    overview: 'Lord Eddard Stark is troubled by an ancient evil...',
    airDate: '2011-04-17',
    runtime: 62,
    stillUrl: 'https://example.com/still.jpg',
  }

  const mockSeasons: SeasonOut[] = [
    {
      id: 's-1',
      seasonNumber: 1,
      name: 'Season 1',
      episodeCount: 1,
      episodes: [mockEpisode],
    },
  ]

  it('renders episode number, title, runtime, and air date', () => {
    render(
      <MediaShowEpisodeCard
        episode={mockEpisode}
        seasonNumber={1}
        showId="show-1"
        showTitle="Game of Thrones"
        seasons={mockSeasons}
        onPlay={vi.fn()}
        onOpenDetails={vi.fn()}
      />,
    )

    expect(screen.getByText('E1')).toBeInTheDocument()
    expect(screen.getByText('Winter Is Coming')).toBeInTheDocument()
    expect(screen.getByText('1h 2m')).toBeInTheDocument()
    expect(screen.getByText('Apr 17, 2011')).toBeInTheDocument()
  })

  it('calls onOpenDetails when clicking the card body', () => {
    const handleOpenDetails = vi.fn()
    const handlePlay = vi.fn()

    render(
      <MediaShowEpisodeCard
        episode={mockEpisode}
        seasonNumber={1}
        showId="show-1"
        seasons={mockSeasons}
        onPlay={handlePlay}
        onOpenDetails={handleOpenDetails}
      />,
    )

    const card = screen.getByTestId('media-show-episode-card-ep-1')
    fireEvent.click(card)

    expect(handleOpenDetails).toHaveBeenCalledTimes(1)
    expect(handleOpenDetails).toHaveBeenCalledWith(mockEpisode, expect.anything())
    expect(handlePlay).not.toHaveBeenCalled()
  })

  it('calls onPlay when clicking the integrated play button, without opening details', () => {
    const handleOpenDetails = vi.fn()
    const handlePlay = vi.fn()

    render(
      <MediaShowEpisodeCard
        episode={mockEpisode}
        seasonNumber={1}
        showId="show-1"
        seasons={mockSeasons}
        onPlay={handlePlay}
        onOpenDetails={handleOpenDetails}
      />,
    )

    const playBtn = screen.getByRole('button', { name: 'Play Winter Is Coming' })
    fireEvent.click(playBtn)

    expect(handlePlay).toHaveBeenCalledTimes(1)
    expect(handlePlay).toHaveBeenCalledWith(mockEpisode)
    expect(handleOpenDetails).not.toHaveBeenCalled()
  })

  it('calls onToggleWatched when clicking the watched toggle button, without opening details', () => {
    const handleOpenDetails = vi.fn()
    const handleToggleWatched = vi.fn()

    render(
      <MediaShowEpisodeCard
        episode={mockEpisode}
        seasonNumber={1}
        showId="show-1"
        seasons={mockSeasons}
        isWatched={false}
        onPlay={vi.fn()}
        onOpenDetails={handleOpenDetails}
        onToggleWatched={handleToggleWatched}
      />,
    )

    const watchBtn = screen.getByRole('button', { name: 'Mark episode as watched' })
    fireEvent.click(watchBtn)

    expect(handleToggleWatched).toHaveBeenCalledTimes(1)
    expect(handleToggleWatched).toHaveBeenCalledWith('ep-1', true)
    expect(handleOpenDetails).not.toHaveBeenCalled()
  })

  it('opens details when pressing Enter on the card', () => {
    const handleOpenDetails = vi.fn()

    render(
      <MediaShowEpisodeCard
        episode={mockEpisode}
        seasonNumber={1}
        showId="show-1"
        seasons={mockSeasons}
        onPlay={vi.fn()}
        onOpenDetails={handleOpenDetails}
      />,
    )

    const card = screen.getByTestId('media-show-episode-card-ep-1')
    fireEvent.keyDown(card, { key: 'Enter' })

    expect(handleOpenDetails).toHaveBeenCalledTimes(1)
    expect(handleOpenDetails).toHaveBeenCalledWith(mockEpisode, expect.anything())
  })

  it('renders downloading state feedback and progress', () => {
    const mockDownload = {
      queueId: 101,
      percentage: 55,
      speed: '12.5 MB/s',
      timeleft: '00:02:40',
      status: 'Downloading',
      quality: '1080p',
      resolution: 'FHD',
      sizeBytes: 1000,
      sizeLeftBytes: 450,
      downloadedBytes: 550,
      releaseTitle: 'Winter.Is.Coming.1080p',
      seasonNumber: 1,
      episodeNumber: 1,
      cancel: vi.fn().mockResolvedValue(undefined),
      isCancelling: false,
    }

    render(
      <MediaShowEpisodeCard
        episode={mockEpisode}
        seasonNumber={1}
        showId="show-1"
        seasons={mockSeasons}
        download={mockDownload}
        onPlay={vi.fn()}
        onOpenDetails={vi.fn()}
      />,
    )

    expect(screen.getByText('55%')).toBeInTheDocument()
    expect(screen.getByText('Downloading')).toBeInTheDocument()
    expect(screen.getByText(/12.5 MB\/s/)).toBeInTheDocument()
    expect(screen.getAllByText(/00:02:40/)[0]).toBeInTheDocument()
  })
})
