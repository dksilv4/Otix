import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    <div className="fixed inset-0 z-[var(--dk-z-modal)] flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full max-w-md rounded-3xl p-8 bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-dialog)]',
          className,
        )}
        style={{ animation: 'authFormFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {title && (
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{title}</h2>
              {description && <p className="text-sm text-[var(--muted-foreground)]">{description}</p>}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="shrink-0 rounded-xl p-1.5 transition-all text-[var(--muted-foreground)] hover:bg-[var(--dk-surface-ghost-hover)] hover:text-[var(--foreground)]"
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
            className="absolute top-4 right-4 rounded-xl p-1.5 transition-all text-[var(--muted-foreground)] hover:bg-[var(--dk-surface-ghost-hover)] hover:text-[var(--foreground)]"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {children}
      </div>
    </div>
  )
}

export { DkDialog }
