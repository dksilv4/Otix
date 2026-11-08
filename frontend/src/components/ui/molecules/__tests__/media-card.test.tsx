import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MediaCard } from '../media-card'
import * as activityHooks from '@/features/media/hooks/use-media-activity'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className, ...props }: any) => (
    <div data-testid="media-card-link" className={className} {...props}>
      {children}
    </div>
  ),
  useNavigate: () => vi.fn(),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQueryClient: () => ({
      prefetchQuery: vi.fn(),
    }),
  }
})

vi.mock('@/features/media/hooks/use-media-activity', () => ({
  useMediaActivity: vi.fn(),
  useMediaActivityCatalog: () => ({ data: null }),
}))

vi.mock('@/lib/modals/modal-context', () => ({
  useModal: () => ({
    openModal: vi.fn(),
    closeModal: vi.fn(),
  }),
}))

describe('MediaCard node activity & rating badge', () => {
  it('renders available node activity badge when media is present on a node', () => {
    vi.mocked(activityHooks.useMediaActivity).mockReturnValue({
      status: 'available',
      mediaType: 'movie',
      tmdbId: '123',
      title: 'Inception',
      nodeName: 'Primary Node',
      isOwned: true,
      canManage: true,
      owner: { id: 1, username: 'dk' },
    })

    render(
      <MediaCard
        id="123"
        mediaType="movie"
        title="Inception"
      />,
    )

    const badge = screen.getByRole('button', { name: /Available to stream · Primary Node/i })
    expect(badge).toBeInTheDocument()
  })

  it('renders processing activity badge when node is downloading', () => {
    vi.mocked(activityHooks.useMediaActivity).mockReturnValue({
      status: 'processing',
      mediaType: 'movie',
      tmdbId: '123',
      title: 'Inception',
      progress: 68,
      nodeName: 'Main Node',
      isOwned: true,
      canManage: true,
      owner: { id: 1, username: 'dk' },
    })

    render(
      <MediaCard
        id="123"
        mediaType="movie"
        title="Inception"
      />,
    )

    const badge = screen.getByRole('button', { name: /Downloading \(68%\) · Main Node/i })
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('text-sky-400')
  })

  it('renders requested activity badge when node has requested status', () => {
    vi.mocked(activityHooks.useMediaActivity).mockReturnValue({
      status: 'requested',
      mediaType: 'movie',
      tmdbId: '123',
      title: 'Inception',
      nodeName: "Friend's Box",
      isOwned: false,
      canManage: false,
      owner: { id: 2, username: 'bob', displayName: 'Bob' },
    })

    render(
      <MediaCard
        id="123"
        mediaType="movie"
        title="Inception"
      />,
    )

    const badge = screen.getByRole('button', { name: /Requested · Friend's Box \(via Bob\)/i })
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('text-amber-400')
  })

  it('does not render activity badge when media has no active node status', () => {
    vi.mocked(activityHooks.useMediaActivity).mockReturnValue(undefined)

    render(
      <MediaCard
        id="456"
        mediaType="movie"
        title="Interstellar"
      />,
    )

    expect(screen.queryByRole('button', { name: /Available to stream/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Downloading/i })).not.toBeInTheDocument()
  })

  it('suppresses badge when hideStreamBadge is true even if node activity exists', () => {
    vi.mocked(activityHooks.useMediaActivity).mockReturnValue({
      status: 'available',
      mediaType: 'movie',
      tmdbId: '789',
      title: 'Dunkirk',
      nodeName: 'Primary Node',
      isOwned: true,
      canManage: true,
      owner: { id: 1, username: 'dk' },
    })

    render(
      <MediaCard
        id="789"
        mediaType="movie"
        title="Dunkirk"
        hideStreamBadge={true}
      />,
    )

    expect(screen.queryByRole('button', { name: /Available to stream/i })).not.toBeInTheDocument()
  })

  it('renders rating badge continuously (all the time) without hover-only opacity classes', () => {
    vi.mocked(activityHooks.useMediaActivity).mockReturnValue(undefined)

    const { container } = render(
      <MediaCard
        id="101"
        mediaType="movie"
        title="The Matrix"
        avgRating={8.7}
      />,
    )

    const ratingElement = screen.getByText('8.7')
    expect(ratingElement).toBeInTheDocument()

    // Container should NOT have opacity-0 or group-hover:opacity-100
    const ratingWrapper = container.querySelector('.top-2\\.5.right-2\\.5')
    expect(ratingWrapper).toBeInTheDocument()
    expect(ratingWrapper).not.toHaveClass('opacity-0')
    expect(ratingWrapper).not.toHaveClass('group-hover:opacity-100')
  })

  it('renders rating to the left of the activity tag without collision when both are present', () => {
    vi.mocked(activityHooks.useMediaActivity).mockReturnValue({
      status: 'available',
      mediaType: 'movie',
      tmdbId: '101',
      title: 'Gladiator',
      nodeName: 'Primary Node',
      isOwned: true,
      canManage: true,
      owner: { id: 1, username: 'dk' },
    })

    const { container } = render(
      <MediaCard
        id="101"
        mediaType="movie"
        title="Gladiator"
        avgRating={8.7}
      />,
    )

    // Activity tag is present
    const activityTag = screen.getByRole('button', { name: /Available to stream · Primary Node/i })
    expect(activityTag).toBeInTheDocument()

    // Rating is present with text 8.7
    expect(screen.getByText('8.7')).toBeInTheDocument()

    // Rating container has top-3 right-11 positioning adjacent to the tag
    const ratingWrapper = container.querySelector('.right-11')
    expect(ratingWrapper).toBeInTheDocument()
    expect(ratingWrapper).toHaveClass('top-3')
  })
})
