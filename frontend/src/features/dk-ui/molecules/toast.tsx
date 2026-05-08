import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  duration?: number
}

interface ToastContextValue {
  toast: (t: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be inside DkToastProvider')
  return ctx
}

const variantConfig: Record<ToastVariant, { icon: typeof CheckCircle; ring: string }> = {
  success: { icon: CheckCircle, ring: 'ring-green-500/30' },
  error: { icon: AlertCircle, ring: 'ring-destructive/30' },
  warning: { icon: AlertTriangle, ring: 'ring-orange-500/30' },
  info: { icon: Info, ring: 'ring-blue-500/30' },
  default: { icon: Info, ring: 'ring-[var(--dk-ring-color)]' },
}

function DkToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...t, id }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}

      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-[var(--dk-z-toast)] flex flex-col-reverse gap-3 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast: t, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const config = variantConfig[t.variant]
  const Icon = config.icon

  useEffect(() => {
    const timer = setTimeout(() => onRemove(t.id), t.duration ?? 4000)
    return () => clearTimeout(timer)
  }, [t.id, t.duration, onRemove])

  return (
    <div
      role="alert"
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-2xl p-4',
        'bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-lg)] ring-1 ring-inset',
        config.ring,
        'animate-[authFormFadeIn_0.2s_cubic-bezier(0.16,1,0.3,1)]',
        'max-w-sm',
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">{t.title}</p>
        {t.description && (
          <p className="text-xs text-muted-foreground">{t.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(t.id)}
        className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground transition-all"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export { DkToastProvider }
