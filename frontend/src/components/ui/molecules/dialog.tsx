import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
  /** @deprecated Ambient orbs have been removed from modals. */
  showAmbient?: boolean
}

const DkDialog = ({ open, onOpenChange, title, description, children, className }: DkDialogProps) => {
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
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'relative w-full max-w-lg rounded-3xl p-6 sm:p-7 backdrop-blur-3xl text-foreground transition-all overflow-hidden border border-[var(--dk-separator)]',
          className,
        )}
        style={{
          backgroundColor: 'var(--dk-surface-overlay)',
          boxShadow: 'var(--dk-shadow-dialog)',
          animation: 'authFormFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {title && (
          <div className="mb-5 flex shrink-0 items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-foreground tracking-tight">{title}</h2>
              {description && <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="shrink-0 rounded-xl p-2 transition-all text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground cursor-pointer"
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
            className="absolute top-4 right-4 rounded-xl p-2 transition-all text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground cursor-pointer"
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
};

export { DkDialog }
