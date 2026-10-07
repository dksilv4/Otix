import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  DiscoverPlayerActivityCard,
  type LiveMediaActivityItem,
} from '../discover-player-activity-card'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    className,
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, unknown>
    className?: string
  }) => (
    <a href={to} data-params={JSON.stringify(params)} className={className}>
      {children}
    </a>
  ),
}))

describe('DiscoverPlayerActivityCard', () => {
  const mockGameItem: LiveMediaActivityItem = {
    id: 'game-elden-ring-123',
    mediaType: 'game',
    mediaId: 'elden-ring',
    title: 'Elden Ring',
    subtitle: 'FromSoftware',
    user: {
      id: 'u1',
      username: 'diogosilva',
      avatarUrl: 'https://images.otix.tv/avatars/u1.jpg',
    },
    posterUrl: 'https://images.otix.tv/posters/elden.jpg',
    backdropUrl: 'https://images.otix.tv/backdrops/elden.jpg',
    elapsedMs: 6300000, // 1h 45m
    fps: 144,
    sessionXp: 20,
  }

  it('renders user details, game title, subtitle, and live metrics without playing now tag', () => {
    render(<DiscoverPlayerActivityCard item={mockGameItem} />)

    expect(screen.getByText('diogosilva')).toBeInTheDocument()
    expect(screen.queryByText('Playing Now')).not.toBeInTheDocument()
    expect(screen.getByText('Elden Ring')).toBeInTheDocument()
    expect(screen.getByText('FromSoftware')).toBeInTheDocument()
    expect(screen.getByText(/1:45:00/)).toBeInTheDocument()
    expect(screen.getByText('144 FPS')).toBeInTheDocument()
    expect(screen.getByText('+20 XP')).toBeInTheDocument()
  })

  it('links to user profile and media detail page', () => {
    render(<DiscoverPlayerActivityCard item={mockGameItem} />)

    const profileLink = screen.getByText('diogosilva').closest('a')
    expect(profileLink).toHaveAttribute('href', '/u/$username')
    expect(profileLink).toHaveAttribute('data-params', JSON.stringify({ username: 'diogosilva' }))

    const mediaLink = screen.getByText('Elden Ring').closest('a')
    expect(mediaLink).toHaveAttribute('href', '/media/$mediaType/$mediaId')
    expect(mediaLink).toHaveAttribute('data-params', JSON.stringify({ mediaType: 'game', mediaId: 'elden-ring' }))
  })

  it('renders movie / show watch activity correctly', () => {
    const movieItem: LiveMediaActivityItem = {
      id: 'plex-123',
      mediaType: 'movie',
      mediaId: 'oppenheimer-2023',
      title: 'Oppenheimer',
      user: {
        username: 'Viewer',
      },
      backdropUrl: 'https://images.otix.tv/backdrops/oppenheimer.jpg',
      elapsedMs: 3600000,
    }

    render(<DiscoverPlayerActivityCard item={movieItem} />)

    expect(screen.getByText('Viewer')).toBeInTheDocument()
    expect(screen.getByText('Oppenheimer')).toBeInTheDocument()
    const mediaLink = screen.getByText('Oppenheimer').closest('a')
    expect(mediaLink).toHaveAttribute('href', '/media/$mediaType/$mediaId')
    expect(mediaLink).toHaveAttribute('data-params', JSON.stringify({ mediaType: 'movie', mediaId: 'oppenheimer-2023' }))
  })
})
