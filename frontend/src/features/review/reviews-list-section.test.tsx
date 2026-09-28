import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RatingCard } from './molecules/rating-card'
import { ReviewsListSection } from './organisms/reviews-list-section'
import type { MediaRatingWithUserOut } from './rating-queries'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('./review-vote-queries', () => ({
  useReviewVoteCounts: vi.fn(() => ({ data: { up: 2, down: 0, my_vote: null } })),
  useVoteReview: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
}))

vi.mock('@/lib/providers/auth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-1', username: 'alice' },
    isAuthenticated: true,
  })),
}))

vi.mock('@/lib/modals', () => ({
  useModal: vi.fn(() => ({
    openModal: vi.fn(),
  })),
}))

const mockUseQuery = vi.fn()
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: (...args: any[]) => mockUseQuery(...args),
  }
})

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('RatingCard', () => {
  const sampleRating: MediaRatingWithUserOut = {
    userId: 'user-2',
    mediaItemId: 'media-1',
    score: 8,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    user: { id: 'user-2', username: 'bob', isAdmin: false },
    hasReview: false,
  }

  it('renders username, score, and star score properly', () => {
    render(<RatingCard rating={sampleRating} />)
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByText('8/10')).toBeInTheDocument()
    expect(screen.getByText(/4 \/ 5 ★/)).toBeInTheDocument()
  })

  it('displays you badge and calls onEdit when isOwn is true', () => {
    const onEdit = vi.fn()
    render(<RatingCard rating={sampleRating} isOwn={true} onEdit={onEdit} />)
    expect(screen.getByText('you')).toBeInTheDocument()

    const editBtn = screen.getByTitle('Edit rating or add a review')
    fireEvent.click(editBtn)
    expect(onEdit).toHaveBeenCalledOnce()
  })
})

describe('ReviewsListSection', () => {
  it('renders empty state with call-to-action when 0 reviews and 0 ratings', () => {
    mockUseQuery.mockImplementation(({ queryKey: _queryKey }: { queryKey: string[] }) => {
      return {
        data: [],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      }
    })

    renderWithClient(<ReviewsListSection mediaType="movie" mediaId="1" />)
    expect(screen.queryByText('Community Reviews & Ratings')).not.toBeInTheDocument()
    expect(screen.getByText('No reviews or ratings yet')).toBeInTheDocument()
    expect(screen.getByText('Write the First Review')).toBeInTheDocument()
  })

  it('renders ratings tab and banner prompt when 0 reviews but ratings exist', () => {
    const sampleRatings: MediaRatingWithUserOut[] = [
      {
        userId: 'user-3',
        mediaItemId: '1',
        score: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        user: { id: 'user-3', username: 'carol', isAdmin: true },
        hasReview: false,
      },
    ]

    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: any[] }) => {
      // rating list query
      if (queryKey[0] === 'media-rating' && queryKey[1] === 'list') {
        return { data: sampleRatings, isLoading: false, isError: false, refetch: vi.fn() }
      }
      // reviews list or my queries
      return { data: [], isLoading: false, isError: false, refetch: vi.fn() }
    })

    renderWithClient(<ReviewsListSection mediaType="movie" mediaId="1" />)
    // Ratings tab should be active
    expect(screen.getByText('Ratings')).toBeInTheDocument()
    expect(screen.getByText('carol')).toBeInTheDocument()
    expect(screen.getByText('10/10')).toBeInTheDocument()
    // Prompt banner should encourage writing the first review
    expect(screen.getByText('No written reviews yet')).toBeInTheDocument()
    expect(screen.getByText('Fans have rated this title. Be the first to share an in-depth review!')).toBeInTheDocument()
  })

  it('renders both tabs and toggles between reviews and ratings when both exist', () => {
    const sampleReviews = [
      {
        userId: 'user-4',
        mediaItemId: '1',
        title: 'Great Film',
        content: 'Loved every minute of it.',
        isSpoiler: false,
        isPrivate: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cooldownUntil: null,
        user: { id: 'user-4', username: 'dan', isAdmin: false },
        rating: { score: 9 },
      },
    ]

    const sampleRatings: MediaRatingWithUserOut[] = [
      {
        userId: 'user-5',
        mediaItemId: '1',
        score: 8,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        user: { id: 'user-5', username: 'elena', isAdmin: false },
        hasReview: false,
      },
    ]

    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: any[] }) => {
      if (queryKey[0] === 'reviews' && queryKey[1] === 'list') {
        return { data: sampleReviews, isLoading: false, isError: false, refetch: vi.fn() }
      }
      if (queryKey[0] === 'media-rating' && queryKey[1] === 'list') {
        return { data: sampleRatings, isLoading: false, isError: false, refetch: vi.fn() }
      }
      return { data: null, isLoading: false, isError: false, refetch: vi.fn() }
    })

    renderWithClient(<ReviewsListSection mediaType="movie" mediaId="1" />)
    // Reviews should show initially
    expect(screen.getByText('Loved every minute of it.')).toBeInTheDocument()

    // Click ratings tab
    const ratingsTab = screen.getByRole('tab', { name: /Ratings/i })
    fireEvent.click(ratingsTab)

    // Now elena's rating should be visible
    expect(screen.getByText('elena')).toBeInTheDocument()
    expect(screen.getByText('8/10')).toBeInTheDocument()
  })

  it('renders section error placeholder when both queries fail', () => {
    const reviewsRefetch = vi.fn()
    const ratingsRefetch = vi.fn()

    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: any[] }) => {
      if (queryKey[0] === 'reviews' && queryKey[1] === 'list') {
        return { data: undefined, isLoading: false, isError: true, refetch: reviewsRefetch }
      }
      if (queryKey[0] === 'media-rating' && queryKey[1] === 'list') {
        return { data: undefined, isLoading: false, isError: true, refetch: ratingsRefetch }
      }
      return { data: null, isLoading: false, isError: false, refetch: vi.fn() }
    })

    renderWithClient(<ReviewsListSection mediaType="movie" mediaId="1" />)
    expect(screen.getByText('Failed to load community feedback.')).toBeInTheDocument()

    const retryBtn = screen.getByRole('button', { name: /Retry/i })
    fireEvent.click(retryBtn)
    expect(reviewsRefetch).toHaveBeenCalledOnce()
    expect(ratingsRefetch).toHaveBeenCalledOnce()
  })

  it('renders tab error placeholder when only reviews query fails', () => {
    const sampleRatings: MediaRatingWithUserOut[] = [
      {
        userId: 'user-5',
        mediaItemId: '1',
        score: 8,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        user: { id: 'user-5', username: 'elena', isAdmin: false },
        hasReview: false,
      },
    ]

    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: any[] }) => {
      if (queryKey[0] === 'reviews' && queryKey[1] === 'list') {
        return { data: undefined, isLoading: false, isError: true, refetch: vi.fn() }
      }
      if (queryKey[0] === 'media-rating' && queryKey[1] === 'list') {
        return { data: sampleRatings, isLoading: false, isError: false, refetch: vi.fn() }
      }
      return { data: null, isLoading: false, isError: false, refetch: vi.fn() }
    })

    renderWithClient(<ReviewsListSection mediaType="movie" mediaId="1" />)
    const reviewsTab = screen.getByRole('tab', { name: /Reviews/i })
    fireEvent.click(reviewsTab)
    expect(screen.getByText('Failed to load reviews.')).toBeInTheDocument()
  })
})
