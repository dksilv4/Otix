import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { AssetEditor } from '../pages/settings-profile-page'

const mockPost = vi.fn()
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: (...args: any[]) => mockPost(...args),
  },
}))

describe('AssetEditor image upload component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-blob-uuid')
    global.URL.revokeObjectURL = vi.fn()
  })

  it('renders default file mode and allows switching between File and URL modes', () => {
    render(
      <ModalProvider>
        <AssetEditor value="" onSubmit={vi.fn()} />
        <ModalRoot />
      </ModalProvider>
    )

    expect(screen.getByText('Click to select image')).toBeInTheDocument()
    expect(screen.getByText('PNG, JPEG, WebP, GIF — max 5MB')).toBeInTheDocument()

    // Mode toggle to URL
    const urlButton = screen.getByRole('button', { name: 'URL' })
    fireEvent.click(urlButton)

    expect(screen.getByPlaceholderText('https://example.com/image.jpg')).toBeInTheDocument()

    // Mode toggle back to File
    const fileButton = screen.getByRole('button', { name: 'Upload' })
    fireEvent.click(fileButton)

    expect(screen.getByText('Click to select image')).toBeInTheDocument()
  })

  it('submits URL directly when in URL mode', () => {
    const onSubmit = vi.fn()
    render(
      <ModalProvider>
        <AssetEditor value="" onSubmit={onSubmit} />
        <ModalRoot />
      </ModalProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'URL' }))
    const input = screen.getByPlaceholderText('https://example.com/image.jpg')
    fireEvent.change(input, { target: { value: 'https://example.com/avatar.jpg' } })

    const applyBtn = screen.getByRole('button', { name: 'Apply' })
    expect(applyBtn).toBeEnabled()
    fireEvent.click(applyBtn)

    expect(onSubmit).toHaveBeenCalledWith('https://example.com/avatar.jpg')
  })

  it('uploads selected file to /upload and invokes onSubmit with the result', async () => {
    const onSubmit = vi.fn()
    mockPost.mockResolvedValueOnce({
      data: { url: 'http://localhost:8000/uploads/test-image-123.png' },
    })

    const { container } = render(
      <ModalProvider>
        <AssetEditor value="" onSubmit={onSubmit} />
        <ModalRoot />
      </ModalProvider>
    )

    const file = new File(['fake-png-content'], 'avatar.png', { type: 'image/png' })
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).not.toBeNull()

    fireEvent.change(fileInput, { target: { files: [file] } })

    // Preview should now be shown
    expect(screen.getByText('avatar.png')).toBeInTheDocument()

    const applyBtn = screen.getByRole('button', { name: 'Apply' })
    expect(applyBtn).toBeEnabled()
    fireEvent.click(applyBtn)

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/upload', expect.any(FormData))
      expect(onSubmit).toHaveBeenCalledWith('http://localhost:8000/uploads/test-image-123.png')
    })

    const formData = mockPost.mock.calls[0][1] as FormData
    const sentFile = formData.get('file') as File
    expect(sentFile.name).not.toBe('avatar.png')
    expect(sentFile.name).toMatch(/^upload_\d+_[a-z0-9]+\.png$/)
  })

  it('displays error message when /upload fails', async () => {
    mockPost.mockRejectedValueOnce({
      response: {
        data: {
          detail: 'Unsupported file type: image/svg+xml. Allowed: png, jpeg, webp, gif',
        },
      },
    })

    const { container } = render(
      <ModalProvider>
        <AssetEditor value="" onSubmit={vi.fn()} />
        <ModalRoot />
      </ModalProvider>
    )

    const file = new File(['<svg></svg>'], 'badge.svg', { type: 'image/svg+xml' })
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    const applyBtn = screen.getByRole('button', { name: 'Apply' })
    fireEvent.click(applyBtn)

    await waitFor(() => {
      expect(screen.getByText(/Unsupported file type/)).toBeInTheDocument()
    })
  })

  it('calls onRemove when the Remove button is clicked', () => {
    const onRemove = vi.fn()
    render(
      <ModalProvider>
        <AssetEditor
          value="http://localhost:8000/uploads/existing.png"
          onSubmit={vi.fn()}
          onRemove={onRemove}
        />
        <ModalRoot />
      </ModalProvider>
    )

    const removeBtn = screen.getByRole('button', { name: 'Remove' })
    fireEvent.click(removeBtn)
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})

describe('normalizeUploadedUrl', () => {
  it('rewrites internal container hosts to window origin', async () => {
    const { normalizeUploadedUrl } = await import('../utils/profile')
    expect(normalizeUploadedUrl('http://api:8000/uploads/test.png')).toBe('http://localhost:3000/uploads/test.png')
    expect(normalizeUploadedUrl('http://otix-api:8000/uploads/test.png')).toBe('http://localhost:3000/uploads/test.png')
  })

  it('prepends origin for relative uploads path', async () => {
    const { normalizeUploadedUrl } = await import('../utils/profile')
    expect(normalizeUploadedUrl('/uploads/test.png')).toBe('http://localhost:3000/uploads/test.png')
  })

  it('preserves external image URLs intact', async () => {
    const { normalizeUploadedUrl } = await import('../utils/profile')
    expect(normalizeUploadedUrl('https://example.com/avatar.png')).toBe('https://example.com/avatar.png')
  })
})
