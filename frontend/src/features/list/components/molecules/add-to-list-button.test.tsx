import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddToListButton } from './add-to-list-button'

const mockMutate = vi.fn()
const mockRemoveMutate = vi.fn()
const mockCreateMutateAsync = vi.fn()
const mockOpenModal = vi.fn()
let mockUserListsData: any[] = Array.from({ length: 10 }, (_, i) => ({
  id: `list-${i + 1}`,
  name: `List ${i + 1}`,
  userId: 'user-1',
  description: null,
  isPublic: false,
  likeCount: 0,
  isLiked: false,
  createdAt: '',
  updatedAt: '',
  itemCount: i * 2,
}))
let mockMemberListsData: string[] = ['list-2']

vi.mock('@auth/hooks/use-auth', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}))

vi.mock('../../list-queries', () => ({
  useUserLists: () => ({
    data: mockUserListsData,
  }),
  useListsForMedia: () => ({
    data: mockMemberListsData,
    isLoading: false,
  }),
  useAddToList: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useRemoveFromList: () => ({
    mutate: mockRemoveMutate,
    isPending: false,
  }),
  useCreateList: () => ({
    mutateAsync: mockCreateMutateAsync,
  }),
}))

vi.mock('@/lib/modals', () => ({
  useModal: () => ({
    openModal: mockOpenModal,
  }),
}))

describe('AddToListButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserListsData = Array.from({ length: 10 }, (_, i) => ({
      id: `list-${i + 1}`,
      name: `List ${i + 1}`,
      userId: 'user-1',
      description: null,
      isPublic: false,
      likeCount: 0,
      isLiked: false,
      createdAt: '',
      updatedAt: '',
      itemCount: i * 2,
    }))
    mockMemberListsData = ['list-2']
  })

  it('renders the button trigger', () => {
    render(<AddToListButton mediaItemId="media-1" />)
    expect(screen.getByRole('button', { name: /list/i })).toBeInTheDocument()
  })

  it('opens picker and displays scrollable lists and search bar when opened', async () => {
    render(<AddToListButton mediaItemId="media-1" />)
    await userEvent.click(screen.getByRole('button', { name: /list/i }))

    expect(screen.getByPlaceholderText('Search lists...')).toBeInTheDocument()
    expect(screen.getByText('List 1')).toBeInTheDocument()
    expect(screen.getByText('List 10')).toBeInTheDocument()
    expect(screen.getByText('New List')).toBeInTheDocument()
  })

  it('filters lists when typing in the search bar', async () => {
    render(<AddToListButton mediaItemId="media-1" />)
    await userEvent.click(screen.getByRole('button', { name: /list/i }))

    const searchInput = screen.getByPlaceholderText('Search lists...')
    await userEvent.type(searchInput, 'List 7')

    expect(screen.getByText('List 7')).toBeInTheDocument()
    expect(screen.queryByText('List 1')).not.toBeInTheDocument()
    expect(screen.queryByText('List 2')).not.toBeInTheDocument()
  })

  it('shows no matches message when filter does not match any list', async () => {
    render(<AddToListButton mediaItemId="media-1" />)
    await userEvent.click(screen.getByRole('button', { name: /list/i }))

    const searchInput = screen.getByPlaceholderText('Search lists...')
    await userEvent.type(searchInput, 'NonExistent')

    expect(screen.getByText(/No lists matching/)).toBeInTheDocument()
  })

  it('adds item to list when clicked', async () => {
    render(<AddToListButton mediaItemId="media-1" />)
    await userEvent.click(screen.getByRole('button', { name: /list/i }))

    await userEvent.click(screen.getByText('List 3'))
    expect(mockMutate).toHaveBeenCalledWith(
      { listId: 'list-3', mediaItemId: 'media-1' },
    )
  })

  it('removes item from list when clicking an already-added list', async () => {
    render(<AddToListButton mediaItemId="media-1" />)
    await userEvent.click(screen.getByRole('button', { name: /list/i }))

    // List 2 is in mockMemberListsData
    await userEvent.click(screen.getByText('List 2'))
    expect(mockRemoveMutate).toHaveBeenCalledWith(
      { listId: 'list-2', mediaItemId: 'media-1' },
    )
  })

  it('renders the button trigger even when the user has 0 lists', () => {
    mockUserListsData = []
    render(<AddToListButton mediaItemId="media-1" />)
    expect(screen.getByRole('button', { name: /list/i })).toBeInTheDocument()
  })

  it('closes dropdown on Escape key', async () => {
    render(<AddToListButton mediaItemId="media-1" />)
    await userEvent.click(screen.getByRole('button', { name: /list/i }))
    expect(screen.getByPlaceholderText('Search lists...')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search lists...')).not.toBeInTheDocument()
    })
  })

  it('opens New List composer when New List is clicked', async () => {
    render(<AddToListButton mediaItemId="media-1" />)
    await userEvent.click(screen.getByRole('button', { name: /list/i }))

    await userEvent.click(screen.getByText('New List'))
    expect(mockOpenModal).toHaveBeenCalled()
  })
})
