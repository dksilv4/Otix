// TODO: Review this file
import { useState, useCallback } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { SlidersHorizontal, Check, X, AlertTriangle } from 'lucide-react'
import { DkButton } from '@/old-features/dk-ui/atoms/button'

async function getCroppedBlob(
  imageUrl: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
  outputSize: { width: number; height: number },
  format: 'image/jpeg' | 'image/webp' | 'image/png' = 'image/webp',
  quality = 0.92,
): Promise<Blob> {
  const response = await fetch(imageUrl)
  const blob = await response.blob()
  const image = await createImageBitmap(blob)

  const canvas = document.createElement('canvas')
  canvas.width = outputSize.width
  canvas.height = outputSize.height
  const ctx = canvas.getContext('2d')!

  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, outputSize.width, outputSize.height,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result)
        else reject(new Error('Canvas toBlob returned null'))
      },
      format,
      quality,
    )
  })
}

import './crop-modal.scss'

interface CropModalProps {
  imageUrl: string
  shape: 'round' | 'rect'
  aspect: number
  outputSize: { width: number; height: number }
  onComplete: (blob: Blob) => void
  onCancel: () => void
}

export function CropModal({
  imageUrl,
  shape,
  aspect,
  outputSize,
  onComplete,
  onCancel,
}: CropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels)
    setError(null)
  }, [])

  const handleApply = async () => {
    if (!croppedAreaPixels) return
    setError(null)
    setProcessing(true)
    try {
      const blob = await getCroppedBlob(
        imageUrl,
        croppedAreaPixels,
        outputSize,
        'image/webp',
        0.92,
      )
      setSuccess(true)
      onComplete(blob)
    } catch (err) {
      console.error('Crop failed:', err)
      setError('Failed to crop image. The image may be from a blocked origin.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div
      className="dk-settings-crop-modal"
      style={{ height: '32rem', maxHeight: 'calc(100vh - 4rem)' }}
    >
      {/* header */}
      <div className="dk-settings-crop-modal__header">
        <div className="dk-settings-crop-modal__header-icon">
          <SlidersHorizontal className="h-4 w-4 text-white/60" />
        </div>
        <div className="dk-settings-crop-modal__text-wrap">
          <p className="dk-settings-crop-modal__title">Crop &amp; Resize</p>
          <p className="dk-settings-crop-modal__subtitle">
            {shape === 'round' ? 'Circular — ' : '16:9 — '}
            {outputSize.width}&times;{outputSize.height}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="dk-settings-crop-modal__close-btn"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* cropper area */}
      <div className="dk-settings-crop-modal__cropper">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspect}
          cropShape={shape}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={onCropComplete}
        />
      </div>

      {/* error */}
      {error && (
        <div className="dk-settings-crop-modal__error">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* zoom slider */}
      <div className="dk-settings-crop-modal__zoom">
        <span className="dk-settings-crop-modal__zoom-label">
          {Math.round(zoom * 100)}%
        </span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="dk-settings-crop-modal__slider"
        />
      </div>

      {/* footer */}
      <div className="dk-settings-crop-modal__footer">
        <p className="dk-settings-crop-modal__hint">Drag to position. Scroll to zoom.</p>
        <div className="dk-settings-crop-modal__actions">
          <DkButton
            type="button"
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="dk-settings-crop-modal__action--cancel"
          >
            Cancel
          </DkButton>
          <DkButton
            type="button"
            size="sm"
            variant="primary"
            onClick={handleApply}
            loading={processing}
            disabled={!croppedAreaPixels || success}
            className={success ? "dk-settings-crop-modal__action--success" : ""}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            {success ? "Applied" : "Apply"}
          </DkButton>
        </div>
      </div>
    </div>
  )
}
