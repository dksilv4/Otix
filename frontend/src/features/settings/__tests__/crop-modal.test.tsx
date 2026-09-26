import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CropModal } from '../components/molecules/crop-modal'

// Mock react-easy-crop
vi.mock('react-easy-crop', () => ({
  default: ({ onCropComplete, onZoomChange: _onZoomChange }: { onCropComplete: (crop: unknown, pixelCrop: unknown) => void; onZoomChange?: (zoom: number) => void }) => {
    return (
      <div data-testid="mock-cropper">
        <button
          type="button"
          onClick={() =>
            onCropComplete(
              { x: 0, y: 0, width: 100, height: 100 },
              { x: 10, y: 10, width: 200, height: 200 }
            )
          }
        >
          Simulate Crop Area
        </button>
      </div>
    )
  },
}))

describe('CropModal component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['fake-image-bytes'], { type: 'image/png' })),
    })
    // Mock createImageBitmap and Canvas
    global.createImageBitmap = vi.fn().mockResolvedValue({
      width: 400,
      height: 400,
      close: vi.fn(),
    })
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
    })
    HTMLCanvasElement.prototype.toBlob = vi.fn((callback: any) => {
      callback(new Blob(['mock-cropped-blob'], { type: 'image/webp' }))
    })
  })

  it('renders circular crop mode for avatar with correct subtitle and dimensions', () => {
    render(
      <CropModal
        imageUrl="blob:http://localhost/test-image"
        shape="round"
        aspect={1}
        outputSize={{ width: 400, height: 400 }}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('Crop & Resize')).toBeInTheDocument()
    expect(screen.getByText('Circular — 400×400')).toBeInTheDocument()
    expect(screen.getByTestId('mock-cropper')).toBeInTheDocument()
  })

  it('renders rectangular 16:9 crop mode for banner cover', () => {
    render(
      <CropModal
        imageUrl="blob:http://localhost/test-image"
        shape="rect"
        aspect={16 / 9}
        outputSize={{ width: 1200, height: 675 }}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText('16:9 — 1200×675')).toBeInTheDocument()
  })

  it('calls onCancel when Cancel or Close button is clicked', () => {
    const onCancel = vi.fn()
    render(
      <CropModal
        imageUrl="blob:http://localhost/test-image"
        shape="round"
        aspect={1}
        outputSize={{ width: 400, height: 400 }}
        onComplete={vi.fn()}
        onCancel={onCancel}
      />
    )

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('enables Apply once crop area is selected and outputs cropped blob', async () => {
    const onComplete = vi.fn()
    render(
      <CropModal
        imageUrl="blob:http://localhost/test-image"
        shape="round"
        aspect={1}
        outputSize={{ width: 400, height: 400 }}
        onComplete={onComplete}
        onCancel={vi.fn()}
      />
    )

    const applyBtn = screen.getByRole('button', { name: /Apply/i })
    expect(applyBtn).toBeDisabled()

    // Simulate crop completion from Cropper
    fireEvent.click(screen.getByText('Simulate Crop Area'))
    expect(applyBtn).toBeEnabled()

    fireEvent.click(applyBtn)

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(expect.any(Blob))
    })
  })
})
