import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EpisodeModal } from './media-show-episode-modal'

const mockStreamEpisode = vi.fn()
vi.mock('@/features/media/hooks/use-stream-episode', () => ({
  useStreamEpisode: () => ({
    streamEpisode: mockStreamEpisode,
  }),
}))

const mockGetEpisodeDownload = vi.fn().mockReturnValue(null)
vi.mock('@/features/media/hooks/use-media-download-activity', () => ({
  useMediaDownloadActivity: () => ({
    getEpisodeDownload: mockGetEpisodeDownload,
  }),
}))

describe('EpisodeModal', () => {
  const sampleEpisode = {
    id: 'ep-1',
    episodeNumber: 3,
    name: 'In Perpetuity',
    airDate: '2022-03-04',
    runtime: 52,
    overview: 'Mark takes the team on a field trip.',
    stillUrl: 'https://image.tmdb.org/t/p/w500/test.jpg',
  }

  it('renders episode details normally when not downloading', () => {
    mockGetEpisodeDownload.mockReturnValue(null)

    render(
      <EpisodeModal
        episode={sampleEpisode as any}
        sourceRect={null}
        onClose={vi.fn()}
        showId="show-1"
        showTitle="Severance"
        seasonNumber={1}
      />,
    )

    expect(screen.getByText('Episode 3')).toBeInTheDocument()
    expect(screen.getByText('In Perpetuity')).toBeInTheDocument()
    expect(screen.getByText('Mark takes the team on a field trip.')).toBeInTheDocument()
    expect(screen.getByText('Stream Episode 3')).toBeInTheDocument()
    expect(screen.queryByTestId('episode-modal-download-banner')).not.toBeInTheDocument()
  })

  it('renders live download stats, progress bar, and cancel action when downloading', () => {
    const cancelMock = vi.fn()
    mockGetEpisodeDownload.mockImplementation((seasonNum, epNum) => {
      if (seasonNum === 1 && epNum === 3) {
        return {
          queueId: 101,
          percentage: 68.5,
          speed: '16.2 MB/s',
          timeleft: '00:01:45',
          status: 'Downloading',
          quality: 'WEB-DL',
          resolution: '1080p',
          cancel: cancelMock,
          isCancelling: false,
        }
      }
      return null
    })

    render(
      <EpisodeModal
        episode={sampleEpisode as any}
        sourceRect={null}
        onClose={vi.fn()}
        showId="show-1"
        showTitle="Severance"
        seasonNumber={1}
      />,
    )

    const banner = screen.getByTestId('episode-modal-download-banner')
    expect(banner).toBeInTheDocument()
    expect(screen.getByText('Downloading Episode')).toBeInTheDocument()
    expect(screen.getByText('69%')).toBeInTheDocument()
    expect(screen.getByText('16.2 MB/s')).toBeInTheDocument()
    expect(screen.getByText('ETA: 00:01:45')).toBeInTheDocument()
    expect(screen.getByText('1080p')).toBeInTheDocument()
    expect(screen.getByText('WEB-DL')).toBeInTheDocument()
    expect(screen.getByText('Stream While Downloading (Episode 3)')).toBeInTheDocument()

    const cancelBtn = screen.getByTitle('Cancel episode download')
    expect(cancelBtn).toBeInTheDocument()
    fireEvent.click(cancelBtn)
    expect(cancelMock).toHaveBeenCalledTimes(1)
  })
})
