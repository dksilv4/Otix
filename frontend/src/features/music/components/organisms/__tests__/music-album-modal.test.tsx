import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MusicAlbumModal } from '../music-album-modal'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
})

describe('MusicAlbumModal', () => {
  it('renders album details and plays entire album on click', () => {
    const handlePlayAll = vi.fn()
    const handleClose = vi.fn()

    render(
      <QueryClientProvider client={queryClient}>
        <MusicAlbumModal
          open={true}
          onClose={handleClose}
          albumTitle="Test Album"
          albumArtist="Test Artist"
          year={2024}
          initialTracks={[
            { id: '1', title: 'Song 1', artist: 'Test Artist', trackNumber: 1, durationMs: 180000 },
            { id: '2', title: 'Song 2', artist: 'Test Artist', trackNumber: 2, durationMs: 200000 },
          ]}
          onPlayAlbum={handlePlayAll}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByText('Test Album')).toBeDefined()
    expect(screen.getByText('Test Artist')).toBeDefined()
    expect(screen.getByText('Song 1')).toBeDefined()
    expect(screen.getByText('Song 2')).toBeDefined()

    const playBtn = screen.getByText('Play Album')
    fireEvent.click(playBtn)
    expect(handlePlayAll).toHaveBeenCalledOnce()
  })
})
