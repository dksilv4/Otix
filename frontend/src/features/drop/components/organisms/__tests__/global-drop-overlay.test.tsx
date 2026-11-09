import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GlobalDropOverlay } from '../global-drop-overlay'

let mockDropState = {
  isDraggingOver: false,
  isProcessing: false,
  progress: null as { current: number; total: number } | null,
  cancelDrop: vi.fn(),
}

vi.mock('../../../hooks/use-global-file-drop', () => ({
  useGlobalFileDrop: () => mockDropState,
}))

describe('GlobalDropOverlay', () => {
  it('renders nothing when not dragging and not processing', () => {
    mockDropState = {
      isDraggingOver: false,
      isProcessing: false,
      progress: null,
      cancelDrop: vi.fn(),
    }

    const { container } = render(<GlobalDropOverlay />)
    expect(container.firstChild).toBeNull()
  })

  it('renders drop dialog using established modal framework when dragging over', () => {
    mockDropState = {
      isDraggingOver: true,
      isProcessing: false,
      progress: null,
      cancelDrop: vi.fn(),
    }

    render(<GlobalDropOverlay />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Drop Music to Play')).toBeInTheDocument()
    expect(
      screen.getByText('Add audio files to your local library and start playing instantly'),
    ).toBeInTheDocument()
    expect(screen.getByText('MP3')).toBeInTheDocument()
    expect(screen.getByText('FLAC')).toBeInTheDocument()
  })

  it('renders importing status in dialog when processing files', () => {
    mockDropState = {
      isDraggingOver: false,
      isProcessing: true,
      progress: { current: 3, total: 10 },
      cancelDrop: vi.fn(),
    }

    render(<GlobalDropOverlay />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Importing Music')).toBeInTheDocument()
    expect(
      screen.getByText('Scanning tags and album art (3 of 10)'),
    ).toBeInTheDocument()
  })
})
