import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  children: ReactNode
  className?: string
  /** @deprecated Ambient orbs have been removed from modals. */
  showAmbient?: boolean
}

function DkDialog({ open, onOpenChange, title, description, children, className }: DkDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onOpenChange(false)
      }
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onOpenChange])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[var(--dk-z-modal)] flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/75 backdrop-blur-md transition-opacity"
        onClick={() => onOpenChange(false)}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full max-w-lg rounded-3xl p-6 sm:p-7 backdrop-blur-3xl text-white transition-all overflow-hidden bg-[#18181b]/95',
          className,
        )}
        style={{
          backgroundColor: 'oklch(from var(--dk-surface-base) l c h / 0.78)',
          boxShadow: 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 30px 60px -12px rgba(0, 0, 0, 0.85)',
          animation: 'authFormFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.04] via-transparent to-black/[0.2]" />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {title && (
          <div className="mb-5 flex shrink-0 items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white tracking-tight">{title}</h2>
              {description && <p className="text-xs text-white/60 leading-relaxed">{description}</p>}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="shrink-0 rounded-xl p-2 transition-all text-white/40 hover:bg-white/10 hover:text-white cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {!title && (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 rounded-xl p-2 transition-all text-white/40 hover:bg-white/10 hover:text-white cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export { DkDialog }
