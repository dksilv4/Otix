import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserProfileSectionItem } from '../components/molecules/user-profile-section-item'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('@/lib/desktop/api', () => ({
  getDesktopAPI: vi.fn(),
  isDesktop: vi.fn(() => false),
}))

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

vi.mock('@/features/launcher', () => ({
  useRunningGame: vi.fn().mockReturnValue({ runningGame: null, runningGames: [], elapsedMs: 0 }),
  useLocalGames: vi.fn().mockReturnValue({ data: [] }),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('UserProfileSectionItem', () => {
  it('renders reviews section with public privacy switch active for owner', () => {
    render(
      <UserProfileSectionItem
        sectionId="reviews"
        username="alice"
        isOwner={true}
        visibilityMap={{ reviews: 'public' }}
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByText('Reviews & Ratings')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /section privacy/i })).toBeInTheDocument()
    const publicBtn = screen.getByRole('button', { name: /set section privacy to public/i })
    expect(publicBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders game_sessions section with private privacy switch active for owner', () => {
    render(
      <UserProfileSectionItem
        sectionId="game_sessions"
        username="alice"
        isOwner={true}
        visibilityMap={{ game_sessions: 'private' }}
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByText('Game Sessions')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /section privacy/i })).toBeInTheDocument()
    const privateBtn = screen.getByRole('button', { name: /set section privacy to private/i })
    expect(privateBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders reviews section with friends privacy switch active for owner', () => {
    render(
      <UserProfileSectionItem
        sectionId="reviews"
        username="alice"
        isOwner={true}
        visibilityMap={{ reviews: 'friends' }}
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByText('Reviews & Ratings')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /section privacy/i })).toBeInTheDocument()
    const friendsBtn = screen.getByRole('button', { name: /set section privacy to friends/i })
    expect(friendsBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders stats overview section without privacy switch for visitor', () => {
    render(
      <UserProfileSectionItem
        sectionId="stats"
        username="alice"
        isOwner={false}
        visibilityMap={{ stats: 'public' }}
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByText('Overview Stats')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /section privacy/i })).not.toBeInTheDocument()
  })

  it('renders achievements section', () => {
    render(
      <UserProfileSectionItem
        sectionId="achievements"
        username="alice"
        isOwner={false}
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByText('Achievements')).toBeInTheDocument()
  })

  it('renders library breakdown section', () => {
    render(
      <UserProfileSectionItem
        sectionId="library_breakdown"
        username="alice"
        isOwner={false}
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByText('Library Breakdown')).toBeInTheDocument()
  })

  it('renders rating distribution section', () => {
    render(
      <UserProfileSectionItem
        sectionId="rating_distribution"
        username="alice"
        isOwner={false}
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByText('Rating Distribution')).toBeInTheDocument()
  })

  it('renders top_5 favorites section with edit button and public privacy switch for owner', () => {
    render(
      <UserProfileSectionItem
        sectionId="top_5"
        username="alice"
        isOwner={true}
        visibilityMap={{ top_5: 'public' }}
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByText('Top 5 Favorites')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /section privacy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
  })

  it('renders activity_heatmap section', () => {
    render(
      <UserProfileSectionItem
        sectionId="activity_heatmap"
        username="alice"
        isOwner={true}
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByText('Activity Heatmap')).toBeInTheDocument()
  })

  it('renders hardware_rig section with private privacy switch for owner', () => {
    render(
      <UserProfileSectionItem
        sectionId="hardware_rig"
        username="alice"
        isOwner={true}
        visibilityMap={{ hardware_rig: 'private' }}
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByText('Hardware & Rig')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /section privacy/i })).toBeInTheDocument()
    const privateBtn = screen.getByRole('button', { name: /set section privacy to private/i })
    expect(privateBtn).toHaveAttribute('aria-pressed', 'true')
  })
})
