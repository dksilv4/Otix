import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGlobalFileDrop } from '../use-global-file-drop'

const mockPlayLocalTracks = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/player/use-player', () => ({
  usePlayer: () => ({
    playLocalTracks: mockPlayLocalTracks,
  }),
}))

const mockExtractFilesFromDataTransfer = vi.fn().mockResolvedValue([])
const mockHandleDroppedMusic = vi.fn().mockResolvedValue({ success: true, audioCount: 1 })
vi.mock('../../utils/drop-extractor', () => ({
  extractFilesFromDataTransfer: (dt: any) => mockExtractFilesFromDataTransfer(dt),
}))
vi.mock('../../utils/drop-music-handler', () => ({
  handleDroppedMusic: (...args: any[]) => mockHandleDroppedMusic(...args),
}))

describe('useGlobalFileDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with default non-dragging state', () => {
    const { result } = renderHook(() => useGlobalFileDrop())
    expect(result.current.isDraggingOver).toBe(false)
    expect(result.current.isProcessing).toBe(false)
    expect(result.current.progress).toBeNull()
  })

  it('sets isDraggingOver when external files are dragged over window', () => {
    const { result } = renderHook(() => useGlobalFileDrop())

    const dragEnterEvent = new Event('dragenter') as any
    dragEnterEvent.preventDefault = vi.fn()
    dragEnterEvent.dataTransfer = {
      types: ['Files'],
    }

    act(() => {
      window.dispatchEvent(dragEnterEvent)
    })

    expect(result.current.isDraggingOver).toBe(true)

    // A second nested dragenter increments counter without toggling
    act(() => {
      window.dispatchEvent(dragEnterEvent)
    })
    expect(result.current.isDraggingOver).toBe(true)

    // First dragleave
    const dragLeaveEvent = new Event('dragleave') as any
    dragLeaveEvent.preventDefault = vi.fn()
    dragLeaveEvent.dataTransfer = {
      types: ['Files'],
    }

    act(() => {
      window.dispatchEvent(dragLeaveEvent)
    })
    expect(result.current.isDraggingOver).toBe(true)

    // Second dragleave restores to false
    act(() => {
      window.dispatchEvent(dragLeaveEvent)
    })
    expect(result.current.isDraggingOver).toBe(false)
  })

  it('ignores internal drag events that do not contain Files', () => {
    const { result } = renderHook(() => useGlobalFileDrop())

    const dragEnterEvent = new Event('dragenter') as any
    dragEnterEvent.preventDefault = vi.fn()
    dragEnterEvent.dataTransfer = {
      types: ['text/plain'],
    }

    act(() => {
      window.dispatchEvent(dragEnterEvent)
    })

    expect(result.current.isDraggingOver).toBe(false)
  })

  it('dismisses drag overlay when Escape key is pressed', () => {
    const { result } = renderHook(() => useGlobalFileDrop())

    const dragEnterEvent = new Event('dragenter') as any
    dragEnterEvent.preventDefault = vi.fn()
    dragEnterEvent.dataTransfer = {
      types: ['Files'],
    }

    act(() => {
      window.dispatchEvent(dragEnterEvent)
    })
    expect(result.current.isDraggingOver).toBe(true)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(result.current.isDraggingOver).toBe(false)
  })

  it('handles drop event and invokes extraction and music drop pipeline', async () => {
    const { result } = renderHook(() => useGlobalFileDrop())

    const mockFile = new File(['song-data'], 'album_track.mp3', { type: 'audio/mpeg' })
    mockExtractFilesFromDataTransfer.mockResolvedValueOnce([
      { file: mockFile, path: 'album_track.mp3' },
    ])

    const dropEvent = new Event('drop') as any
    dropEvent.preventDefault = vi.fn()
    dropEvent.dataTransfer = {
      types: ['Files'],
      files: [mockFile],
    }

    await act(async () => {
      window.dispatchEvent(dropEvent)
    })

    expect(result.current.isDraggingOver).toBe(false)
    expect(mockExtractFilesFromDataTransfer).toHaveBeenCalledWith(dropEvent.dataTransfer)
    expect(mockHandleDroppedMusic).toHaveBeenCalledWith(
      [{ file: mockFile, path: 'album_track.mp3' }],
      mockPlayLocalTracks,
      expect.any(Object),
    )
  })
})
