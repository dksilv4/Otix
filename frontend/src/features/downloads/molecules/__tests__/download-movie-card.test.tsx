import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DownloadMovieCard } from '../download-movie-card'
import type { ServerArrQueueItem } from '../../arr-types'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, className }: any) => (
    <a href={`${to}/${params?.mediaId}`} className={className}>
      {children}
    </a>
  ),
}))

describe('DownloadMovieCard', () => {
  const mockMovieItem: ServerArrQueueItem = {
    id: 9988,
    title: 'Halloween.1978.4K.HDR.DV.2160p.BDRemux Eng Ita x265-NAHOM',
    status: 'downloading',
    size: 50_000_000_000,
    sizeLeft: 20_000_000_000,
    timeleft: '00:35:10',
    mediaItemId: 948,
    movieTitle: 'Halloween',
    movieYear: 1978,
    posterUrl: 'https://image.tmdb.org/t/p/original/halloween.jpg',
    protocol: 'torrent',
    quality: {
      quality: {
        name: 'Remux-2160p',
        resolution: 2160,
      },
    },
  }

  it('renders movie title as link to Otix movie, year, poster, and progress', () => {
    render(<DownloadMovieCard item={mockMovieItem} />)

    const titleLink = screen.getByRole('link', { name: 'Halloween' })
    expect(titleLink).toBeInTheDocument()
    expect(titleLink).toHaveAttribute('href', '/media/$mediaType/$mediaId/948')

    expect(screen.getByText('(1978)')).toBeInTheDocument()

    const poster = screen.getByRole('img', { name: 'Halloween' })
    expect(poster).toHaveAttribute('src', 'https://image.tmdb.org/t/p/original/halloween.jpg')

    expect(screen.getByText('Remux-2160p')).toBeInTheDocument()
    expect(screen.getByText('2160p')).toBeInTheDocument()
    expect(screen.getByText('torrent')).toBeInTheDocument()

    expect(screen.getByText('60.0%')).toBeInTheDocument()
    expect(screen.getByText(/ETA: 00:35:10/i)).toBeInTheDocument()
  })

  it('triggers onCancel when cancel button is clicked', () => {
    const handleCancel = vi.fn()
    render(<DownloadMovieCard item={mockMovieItem} onCancel={handleCancel} />)

    const cancelBtn = screen.getByRole('button', { name: /cancel download/i })
    fireEvent.click(cancelBtn)
    expect(handleCancel).toHaveBeenCalledWith(9988)
  })
})
