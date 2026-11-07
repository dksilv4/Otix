import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MusicFoldersModal } from '../music-folders-modal'

describe('MusicFoldersModal', () => {
  it('renders indexed folders and triggers remove and add callbacks', () => {
    const handleAdd = vi.fn()
    const handleRemove = vi.fn()
    const handleClearAll = vi.fn()
    const handleClose = vi.fn()

    const mockFolders = [
      { id: 'f-1', name: 'MyRockMusic', trackCount: 42 },
      { id: 'f-2', name: 'JazzCollection', trackCount: 15 },
    ]

    render(
      <MusicFoldersModal
        open={true}
        onClose={handleClose}
        folders={mockFolders}
        onAddFolder={handleAdd}
        onRemoveFolder={handleRemove}
        onClearAll={handleClearAll}
      />,
    )

    expect(screen.getByText('Music Folders')).toBeDefined()
    expect(screen.getByText('MyRockMusic')).toBeDefined()
    expect(screen.getByText('42 tracks')).toBeDefined()
    expect(screen.getByText('JazzCollection')).toBeDefined()
    expect(screen.getByText('15 tracks')).toBeDefined()

    const addBtn = screen.getByText('Add Folder')
    fireEvent.click(addBtn)
    expect(handleAdd).toHaveBeenCalledOnce()

    const removeBtn = screen.getByLabelText('Remove folder MyRockMusic')
    fireEvent.click(removeBtn)
    expect(handleRemove).toHaveBeenCalledWith('f-1', 'MyRockMusic')
  })
})
