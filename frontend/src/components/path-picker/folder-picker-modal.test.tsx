import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FolderPickerModal } from './folder-picker-modal'

let mockServers: Array<{ id: number; name: string; isOnline: boolean }> = []
let mockBrowse: {
  current_path: string
  parent_path?: string | null
  is_root: boolean
  entries: Array<{
    name: string
    path: string
    is_dir: boolean
    size: number
    extension: string
    format_category: string
    is_downloadable: boolean
    is_download_location: boolean
  }>
  active_download_path: string
  total_items: number
} | null = null

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: mockServers, isLoading: false }),
}))

vi.mock('@/features/downloads/use-server-explorer', () => ({
  useServerExplorer: (_serverId?: number, path?: string) => ({
    data: mockBrowse && path
      ? { ...mockBrowse, current_path: path, parent_path: path === '/games' ? '/' : null }
      : mockBrowse,
    isLoading: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
}))

const renderModal = (props?: Partial<React.ComponentProps<typeof FolderPickerModal>>) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <FolderPickerModal onSelect={onSelect} onClose={onClose} {...props} />
    </QueryClientProvider>,
  )
  return { onSelect, onClose }
}

describe('FolderPickerModal', () => {
  beforeEach(() => {
    mockServers = [{ id: 1, name: 'Garage NAS', isOnline: true }]
    mockBrowse = {
      current_path: '/',
      parent_path: null,
      is_root: true,
      active_download_path: '/downloads',
      total_items: 2,
      entries: [
        {
          name: 'games',
          path: '/games',
          is_dir: true,
          size: 0,
          extension: '',
          format_category: 'folder',
          is_downloadable: false,
          is_download_location: false,
        },
        {
          name: 'readme.txt',
          path: '/readme.txt',
          is_dir: false,
          size: 12,
          extension: 'txt',
          format_category: 'file',
          is_downloadable: true,
          is_download_location: false,
        },
      ],
    }
  })

  it('lists folders from the connected node and hides files', () => {
    renderModal()

    expect(screen.getByText('games')).toBeInTheDocument()
    expect(screen.queryByText('readme.txt')).not.toBeInTheDocument()
  })

  it('confirms the current folder path', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderModal()

    await user.click(screen.getByRole('button', { name: /Use this folder/i }))
    expect(onSelect).toHaveBeenCalledWith('/')
  })

  it('navigates into a folder then confirms that path', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderModal()

    await user.click(screen.getByRole('button', { name: /^games$/ }))
    await waitFor(() => {
      expect(screen.getByText('/games')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Use this folder/i }))
    expect(onSelect).toHaveBeenCalledWith('/games')
  })

  it('lets the user pick which node to browse when more than one is connected', () => {
    mockServers = [
      { id: 1, name: 'Garage NAS', isOnline: true },
      { id: 2, name: 'Office Box', isOnline: true },
    ]
    renderModal()

    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText('Office Box')).toBeInTheDocument()
  })

  it('lists folders when the API returns camelCase fields', () => {
    mockBrowse = {
      currentPath: '/app',
      parentPath: '/',
      isRoot: false,
      activeDownloadPath: '/app/storage/downloads',
      totalItems: 1,
      entries: [
        {
          name: 'storage',
          path: '/app/storage',
          isDir: true,
          size: 0,
          extension: '',
          formatCategory: 'folder',
          isDownloadable: false,
          isDownloadLocation: false,
        },
      ],
    } as unknown as typeof mockBrowse
    renderModal()

    expect(screen.getByText('storage')).toBeInTheDocument()
    expect(screen.getByText('/app')).toBeInTheDocument()
  })

  it('asks the user to connect a node when none are available', () => {
    mockServers = []
    mockBrowse = null
    renderModal()

    expect(screen.getByText(/No Otix nodes connected to browse folders/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Use this folder/i })).not.toBeInTheDocument()
  })
})
