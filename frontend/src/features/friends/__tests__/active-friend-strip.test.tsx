import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActiveFriendStrip } from '../components/molecules/active-friend-strip'
import type { ActiveFriend } from '../types'

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

describe('ActiveFriendStrip', () => {
  it('returns null when active friends list is empty', () => {
    const { container } = render(<ActiveFriendStrip activeFriends={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders active friends and their latest media', () => {
    const activeFriends: ActiveFriend[] = [
      {
        friend: {
          id: 1,
          username: 'aragorn',
          avatarUrl: null,
          friendsSince: '2024-01-01T00:00:00Z',
        },
        state: 'active_now',
        stateLabel: 'Watched S1E2 of Severance',
        latestActivity: {
          type: 'episode_watched',
          timestamp: '2024-01-01T00:00:00Z',
          summary: 'Watched S1E2 of Severance',
          mediaItem: {
            id: 'sev-1',
            title: 'Severance',
            mediaType: 'show',
            posterUrl: null,
          },
          user: { id: 1, username: 'aragorn', avatarUrl: null },
        },
      },
    ]

    render(<ActiveFriendStrip activeFriends={activeFriends} />)
    expect(screen.getByText('Active Friends')).toBeInTheDocument()
    expect(screen.getByText('aragorn')).toBeInTheDocument()
    expect(screen.getByText('Watched S1E2 of Severance')).toBeInTheDocument()
    expect(screen.getByText('Severance')).toBeInTheDocument()
  })
})
