import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { clearDesktopAPICache } from '@/lib/desktop/api'
import { PathInput } from './path-input'

let mockServers: Array<{ id: number; name: string; isOnline: boolean }> = []
const mockBrowse = {
  current_path: '/mnt/games',
  parent_path: '/mnt',
  is_root: false,
  active_download_path: '/downloads',
  total_items: 1,
  entries: [
    {
      name: 'steam',
      path: '/mnt/games/steam',
      is_dir: true,
      size: 0,
      extension: '',
      format_category: 'folder',
      is_downloadable: false,
      is_download_location: false,
    },
  ],
}

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: mockServers, isLoading: false }),
}))

vi.mock('@/features/downloads/use-server-explorer', () => ({
  useServerExplorer: () => ({
    data: mockBrowse,
    isLoading: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  }),
}))

function Harness({
  target = 'local' as 'local' | 'server',
  initial = '',
}: {
  target?: 'local' | 'server'
  initial?: string
}) {
  const [value, setValue] = useState(initial)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <ModalProvider>
        <PathInput label="Library path" value={value} onChange={setValue} target={target} />
        <ModalRoot />
      </ModalProvider>
    </QueryClientProvider>
  )
}

describe('PathInput', () => {
  beforeEach(() => {
    mockServers = []
    delete (window as any).desktopAPI
    clearDesktopAPICache()
  })

  afterEach(() => {
    delete (window as any).desktopAPI
    clearDesktopAPICache()
  })

  it('lets the user type a path', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const input = screen.getByLabelText('Library path')
    await user.type(input, '/games')
    expect(input).toHaveValue('/games')
  })

  it('disables browse in the browser when no node is connected', () => {
    render(<Harness />)

    const browse = screen.getByRole('button', { name: /Browse/i })
    expect(browse).toBeDisabled()
    expect(browse).toHaveAttribute('title', expect.stringMatching(/connect a game server/i))
  })

  it('uses the native folder dialog for local paths on desktop', async () => {
    const user = userEvent.setup()
    const selectDirectory = vi.fn().mockResolvedValue('D:\\Games')
    ;(window as any).desktopAPI = { selectDirectory }
    clearDesktopAPICache()

    render(<Harness />)

    await user.click(screen.getByRole('button', { name: /Browse/i }))
    expect(selectDirectory).toHaveBeenCalled()
    expect(await screen.findByLabelText('Library path')).toHaveValue('D:\\Games')
  })

  it('opens a node folder picker in the browser when a server is connected', async () => {
    const user = userEvent.setup()
    mockServers = [{ id: 1, name: 'Garage NAS', isOnline: true }]
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: /Browse/i }))
    expect(screen.getByText('Select folder')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Use this folder/i }))
    expect(screen.getByLabelText('Library path')).toHaveValue('/mnt/games')
  })

  it('commits on browse when onCommit is provided', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    const selectDirectory = vi.fn().mockResolvedValue('D:\\Games')
    ;(window as any).desktopAPI = { selectDirectory }
    clearDesktopAPICache()

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function CommitHarness() {
      const [value, setValue] = useState('')
      return (
        <QueryClientProvider client={queryClient}>
          <ModalProvider>
            <PathInput label="Library path" value={value} onChange={setValue} onCommit={onCommit} />
            <ModalRoot />
          </ModalProvider>
        </QueryClientProvider>
      )
    }

    render(<CommitHarness />)
    await user.click(screen.getByRole('button', { name: /Browse/i }))
    expect(onCommit).toHaveBeenCalledWith('D:\\Games')
  })

  it('commits on blur when commitOnBlur is true', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()

    function BlurHarness() {
      const [value, setValue] = useState('')
      return <PathInput label="Target folder" value={value} onChange={setValue} onCommit={onCommit} />
    }

    render(<BlurHarness />)
    const input = screen.getByLabelText('Target folder')
    await user.type(input, '/opt/my-games')
    await user.tab() // triggers blur

    expect(onCommit).toHaveBeenCalledWith('/opt/my-games')
  })

  it('does not commit on blur when commitOnBlur is false', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()

    function NoBlurHarness() {
      const [value, setValue] = useState('')
      return <PathInput label="Draft folder" value={value} onChange={setValue} onCommit={onCommit} commitOnBlur={false} />
    }

    render(<NoBlurHarness />)
    const input = screen.getByLabelText('Draft folder')
    await user.type(input, '/draft/path')
    await user.tab() // triggers blur

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('commits on Enter key', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()

    function EnterHarness() {
      const [value, setValue] = useState('')
      return <PathInput label="Target folder" value={value} onChange={setValue} onCommit={onCommit} />
    }

    render(<EnterHarness />)
    const input = screen.getByLabelText('Target folder')
    await user.type(input, '/enter/folder{Enter}')

    expect(onCommit).toHaveBeenCalledWith('/enter/folder')
  })
})
