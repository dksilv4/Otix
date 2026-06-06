// TODO: Review this file
import { useState, useCallback } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Move, Check, X } from 'lucide-react'
import { DkButton } from '@/features/dk-ui/atoms/button'
import './position-modal.scss'

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
      className="dk-settings-position-modal"
      style={{ height: '32rem', maxHeight: 'calc(100vh - 4rem)' }}
    >
      {/* header */}
      <div className="dk-settings-position-modal__header">
        <div className="dk-settings-position-modal__header-icon">
          <Move className="h-4 w-4 text-white/60" />
        </div>
        <div className="dk-settings-position-modal__header-text">
          <p className="dk-settings-position-modal__header-title">Position Backdrop</p>
          <p className="dk-settings-position-modal__header-subtitle">Drag to choose which part shows as poster</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="dk-settings-position-modal__close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* cropper area — pan only, zoom locked to 1 */}
      <div className="dk-settings-position-modal__cropper">
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
      <div className="dk-settings-position-modal__footer">
        <p className="dk-settings-position-modal__footer-hint">Drag to position.</p>
        <div className="dk-settings-position-modal__footer-actions">
          <DkButton
            type="button"
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="dk-settings-position-modal__cancel-btn"
          >
            Cancel
          </DkButton>
          <DkButton
            type="button"
            size="sm"
            variant="primary"
            onClick={handleApply}
            disabled={applied}
            className={applied ? "dk-settings-position-modal__apply--applied" : ""}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            {applied ? "Applied" : "Apply"}
          </DkButton>
        </div>
      </div>
    </div>
  )
}
