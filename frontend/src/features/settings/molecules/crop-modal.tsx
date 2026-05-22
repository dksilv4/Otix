import { useState, useCallback } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { SlidersHorizontal, Check, X, AlertTriangle } from 'lucide-react'
import { getCroppedBlob } from '@/lib/crop-image'
import { DkButton } from '@/features/dk-ui/atoms/button'

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
      className="flex flex-col rounded-2xl border border-white/[0.12] bg-black/90 p-5 shadow-2xl backdrop-blur-2xl ring-1 ring-white/[0.06] w-[28rem] max-w-[calc(100vw-2rem)]"
      style={{ height: '32rem', maxHeight: 'calc(100vh - 4rem)' }}
    >
      {/* header */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/[0.06]">
          <SlidersHorizontal className="h-4 w-4 text-white/60" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Crop &amp; Resize</p>
          <p className="text-[11px] text-white/40">
            {shape === 'round' ? 'Circular — ' : '16:9 — '}
            {outputSize.width}&times;{outputSize.height}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-white/40 hover:bg-white/[0.08] hover:text-white/70 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* cropper area */}
      <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden bg-white/[0.02]">
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
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* zoom slider */}
      <div className="flex items-center gap-3 mt-4 shrink-0">
        <span className="text-[11px] text-white/30 w-8 text-right tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1 h-1 rounded-full bg-white/[0.08] appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg"
        />
      </div>

      {/* footer */}
      <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
        <p className="text-[11px] text-white/25">Drag to position. Scroll to zoom.</p>
        <div className="flex items-center gap-2">
          <DkButton
            type="button"
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="text-white/60 hover:text-white"
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
            className={success ? "bg-emerald-500 hover:bg-emerald-500 text-white" : ""}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            {success ? "Applied" : "Apply"}
          </DkButton>
        </div>
      </div>
    </div>
  )
}
