import { useState, useCallback } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Move, Check, X } from 'lucide-react'
import { DkButton } from '@/features/dk-ui/atoms/button'

interface PositionModalProps {
  imageUrl: string
  aspect: number
  onComplete: (pos: { positionX: number; positionY: number }) => void
  onCancel: () => void
}

export function PositionModal({
  imageUrl,
  aspect,
  onComplete,
  onCancel,
}: PositionModalProps) {
  const [crop, setCrop] = useState({ x: 50, y: 50 })
  const [applied, setApplied] = useState(false)

  const onCropComplete = useCallback((_: Area, _croppedPixels: Area) => {
    // No-op: we only care about crop.x / crop.y position, not the pixel crop area
  }, [])

  const handleApply = () => {
    if (applied) return
    setApplied(true)
    onComplete({ positionX: crop.x, positionY: crop.y })
  }

  return (
    <div
      className="flex flex-col rounded-2xl bg-black/90 p-5 shadow-2xl backdrop-blur-2xl w-[28rem] max-w-[calc(100vw-2rem)]"
      style={{ height: '32rem', maxHeight: 'calc(100vh - 4rem)' }}
    >
      {/* header */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/[0.06]">
          <Move className="h-4 w-4 text-white/60" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Position Backdrop</p>
          <p className="text-[11px] text-white/40">Drag to choose which part shows as poster</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-white/40 hover:bg-white/[0.08] hover:text-white/70 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* cropper area — pan only, zoom locked to 1 */}
      <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden bg-white/[0.02]">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={1}
          rotation={0}
          aspect={aspect}
          cropShape="rect"
          onCropChange={setCrop}
          onZoomChange={() => {}}
          onRotationChange={() => {}}
          onCropComplete={onCropComplete}
          zoomWithScroll={false}
          minZoom={1}
          maxZoom={1}
        />
      </div>

      {/* footer */}
      <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
        <p className="text-[11px] text-white/25">Drag to position.</p>
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
            disabled={applied}
            className={applied ? "bg-emerald-500 hover:bg-emerald-500 text-white" : ""}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            {applied ? "Applied" : "Apply"}
          </DkButton>
        </div>
      </div>
    </div>
  )
}
