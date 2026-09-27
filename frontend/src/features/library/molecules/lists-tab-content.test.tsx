import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { ListsTabContent } from './lists-tab-content'

const mockDeleteMutateAsync = vi.fn().mockResolvedValue(undefined)
const mockCreateMutateAsync = vi.fn()
const mockOpenModal = vi.fn()

const sampleLists = [
  {
    id: 'list-1',
    userId: 'u1',
    name: 'Anime Favorites',
    description: 'Best anime',
    isPublic: true,
    likeCount: 2,
    isLiked: false,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'list-2',
    userId: 'u1',
    name: 'Movies to Watch',
    description: 'Weekend movies',
    isPublic: false,
    likeCount: 0,
    isLiked: false,
    createdAt: '',
    updatedAt: '',
  },
]

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className, onClick, ...props }: any) => (
    <a className={className} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/offline', () => ({
  useOffline: () => false,
}))

vi.mock('@list', () => ({
  useUserLists: () => ({
    data: sampleLists,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateList: () => ({
    mutateAsync: mockCreateMutateAsync,
  }),
  useDeleteLists: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
  }),
  ListCard: ({ list, selectable, selected, onSelect }: any) => (
    <div data-testid={`list-card-${list.id}`}>
      <span>{list.name}</span>
      {selectable && (
        <button
          aria-label={selected ? `Deselect ${list.name}` : `Select ${list.name}`}
          onClick={() => onSelect(list.id, !selected)}
        >
          {selected ? 'Checked' : 'Unchecked'}
        </button>
      )}
    </div>
  ),
  ListComposer: () => <div>Composer</div>,
}))

vi.mock('@/lib/modals', () => ({
  useModal: () => ({
    openModal: mockOpenModal,
  }),
}))

describe('ListsTabContent multi-select and delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders lists with Select button', () => {
    render(<ListsTabContent />)
    expect(screen.getByText('Anime Favorites')).toBeInTheDocument()
    expect(screen.getByText('Movies to Watch')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /select/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new list/i })).toBeInTheDocument()
  })

  it('enters selection mode when Select is clicked', async () => {
    render(<ListsTabContent />)
    await userEvent.click(screen.getByRole('button', { name: /select/i }))

    expect(screen.getByText('0 of 2 selected')).toBeInTheDocument()
    expect(screen.getByText('Select All')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete \(0\)/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
  })

  it('selects and deselects lists', async () => {
    render(<ListsTabContent />)
    await userEvent.click(screen.getByRole('button', { name: /select/i }))

    const selectBtn = screen.getByRole('button', { name: 'Select Anime Favorites' })
    await userEvent.click(selectBtn)

    expect(screen.getByText('1 of 2 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete \(1\)/i })).not.toBeDisabled()

    // Toggle select all
    await userEvent.click(screen.getByText('Select All'))
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument()
    expect(screen.getByText('Deselect All')).toBeInTheDocument()

    // Toggle deselect all
    await userEvent.click(screen.getByText('Deselect All'))
    expect(screen.getByText('0 of 2 selected')).toBeInTheDocument()
  })

  it('confirms and executes batch deletion', async () => {
    render(<ListsTabContent />)
    await userEvent.click(screen.getByRole('button', { name: /select/i }))

    await userEvent.click(screen.getByText('Select All'))
    await userEvent.click(screen.getByRole('button', { name: /delete \(2\)/i }))

    expect(screen.getByText('Delete 2 lists?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /yes, delete/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /yes, delete/i }))

    expect(mockDeleteMutateAsync).toHaveBeenCalledWith(['list-1', 'list-2'])
  })

  it('exits selection mode when Done is clicked', async () => {
    render(<ListsTabContent />)
    await userEvent.click(screen.getByRole('button', { name: /select/i }))
    expect(screen.getByText('0 of 2 selected')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(screen.queryByText('0 of 2 selected')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /select/i })).toBeInTheDocument()
  })
})
