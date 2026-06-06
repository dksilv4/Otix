import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import './dialog.scss'

interface DkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  children: ReactNode
  className?: string
}

function DkDialog({ open, onOpenChange, title, description, children, className }: DkDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div className="dk-dialog__backdrop">
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="dk-dialog__overlay"
        onClick={() => onOpenChange(false)}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('dk-dialog__panel', className)}
      >
        {title && (
          <div className="dk-dialog__header">
            <div className="dk-dialog__header-text">
              <h2 className="dk-dialog__title">{title}</h2>
              {description && <p className="dk-dialog__description">{description}</p>}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="dk-dialog__close"
              aria-label="Close dialog"
            >
              <X className="dk-dialog__close-icon" />
            </button>
          </div>
        )}

        {!title && (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="dk-dialog__close--absolute"
            aria-label="Close dialog"
          >
            <X className="dk-dialog__close-icon" />
          </button>
        )}

        {children}
      </div>
    </div>
  )
}

export { DkDialog }
