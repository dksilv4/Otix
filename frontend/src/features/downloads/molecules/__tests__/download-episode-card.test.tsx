import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DownloadEpisodeCard } from '../download-episode-card'
import type { ServerArrQueueItem } from '../../arr-types'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, className }: any) => (
    <a href={`${to}/${params?.mediaId}`} className={className}>
      {children}
    </a>
  ),
}))

describe('DownloadEpisodeCard', () => {
  const mockEpisodeItem: ServerArrQueueItem = {
    id: 12345,
    title: 'Brothers.2026.S01E02.The.Hunt.2160p.ATVP.WEB-DL.DD+5.1.Atmos.DoVi.HDR.H.265-playWEB',
    status: 'downloading',
    size: 6_609_583_472,
    sizeLeft: 2_609_583_472,
    timeleft: '00:23:52',
    mediaItemId: 255737,
    showTitle: 'Brothers',
    seasonNumber: 1,
    episodeNumber: 2,
    episodeName: 'The Hunt',
    episodeStillUrl: 'https://image.tmdb.org/t/p/w300/still.jpg',
    protocol: 'usenet',
    downloadClient: 'SABnzbd',
    quality: {
      quality: {
        name: 'WEBDL-2160p',
        resolution: 2160,
      },
    },
  }

  it('renders series title as link to Otix show, episode badge, and episode title', () => {
    render(<DownloadEpisodeCard item={mockEpisodeItem} />)

    // Series title link
    const titleLink = screen.getByRole('link', { name: 'Brothers' })
    expect(titleLink).toBeInTheDocument()
    expect(titleLink).toHaveAttribute('href', '/media/$mediaType/$mediaId/255737')

    // Episode title
    expect(screen.getByText('The Hunt')).toBeInTheDocument()

    // S01E02 badge
    expect(screen.getByText('S01E02')).toBeInTheDocument()

    // Episode still image
    const img = screen.getByRole('img', { name: 'Brothers' })
    expect(img).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w300/still.jpg')

    // Quality and protocol badges
    expect(screen.getByText('WEBDL-2160p')).toBeInTheDocument()
    expect(screen.getByText('2160p')).toBeInTheDocument()
    expect(screen.getByText('usenet')).toBeInTheDocument()
    expect(screen.getByText(/via SABnzbd/i)).toBeInTheDocument()

    // Progress percentage
    expect(screen.getByText('60.5%')).toBeInTheDocument()
    expect(screen.getByText(/ETA: 00:23:52/i)).toBeInTheDocument()
  })

  it('triggers onCancel when cancel button is clicked', () => {
    const handleCancel = vi.fn()
    render(<DownloadEpisodeCard item={mockEpisodeItem} onCancel={handleCancel} />)

    const cancelBtn = screen.getByRole('button', { name: /cancel download/i })
    fireEvent.click(cancelBtn)
    expect(handleCancel).toHaveBeenCalledWith(12345)
  })

  it('displays liveSpeed when provided', () => {
    render(<DownloadEpisodeCard item={mockEpisodeItem} liveSpeed="48.5 MB/s" />)
    expect(screen.getByText(/48.5 MB\/s/)).toBeInTheDocument()
  })
})
