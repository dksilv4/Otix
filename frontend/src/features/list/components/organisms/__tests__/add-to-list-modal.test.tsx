import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AddToListModal } from '../add-to-list-modal'
import * as listQueries from '../../../list-queries'

vi.mock('@auth/hooks/use-auth', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: 'user-1' } }),
}))

vi.mock('@/lib/modals', () => ({
  useModal: () => ({
    openModal: vi.fn(),
    closeModal: vi.fn(),
  }),
}))

describe('AddToListModal', () => {
  let queryClient: QueryClient
  const mockMutateAsync = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    vi.spyOn(listQueries, 'useUserLists').mockReturnValue({
      data: [
        { id: 'list-1', name: 'Must Watch', userId: 'user-1', isPublic: false, likeCount: 0, isLiked: false, createdAt: '', updatedAt: '' },
        { id: 'list-2', name: 'Weekend Marathon', userId: 'user-1', isPublic: true, likeCount: 2, isLiked: false, createdAt: '', updatedAt: '' },
      ],
      isLoading: false,
    } as any)

    vi.spyOn(listQueries, 'useListsForMedia').mockReturnValue({
      data: ['list-1'],
      isLoading: false,
    } as any)

    vi.spyOn(listQueries, 'useAddToList').mockReturnValue({
      mutateAsync: mockMutateAsync,
    } as any)

    vi.spyOn(listQueries, 'useRemoveFromList').mockReturnValue({
      mutateAsync: mockMutateAsync,
    } as any)
  })

  it('renders modal with list names and checked indicators', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AddToListModal
          mediaItemId="media-123"
          mediaTitle="Inception"
          mediaType="movie"
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByText('Add to List')).toBeInTheDocument()
    expect(screen.getByText('Must Watch')).toBeInTheDocument()
    expect(screen.getByText('Weekend Marathon')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <QueryClientProvider client={queryClient}>
        <AddToListModal
          mediaItemId="media-123"
          mediaTitle="Inception"
          onClose={onClose}
        />
      </QueryClientProvider>,
    )

    const closeBtn = screen.getByLabelText('Close')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('toggles list membership when clicked', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AddToListModal
          mediaItemId="media-123"
          mediaTitle="Inception"
          mediaType="movie"
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    )

    const uncheckItem = screen.getByText('Weekend Marathon')
    fireEvent.click(uncheckItem)
    expect(mockMutateAsync).toHaveBeenCalledWith({
      listId: 'list-2',
      mediaItemId: 'media-123',
      mediaType: 'movie',
    })
  })
})
