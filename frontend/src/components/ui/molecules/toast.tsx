import { Component, useEffect, useState, useCallback, createContext, useContext, type ReactNode } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info' | 'destructive'

export interface Toast {
  id: string
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

interface ToastContextValue {
  toast: (t: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const listeners: Set<(t: Omit<Toast, 'id'>) => void> = new Set()

/**
 * Dispatch a toast from anywhere (React or non-React code).
 */
export function showToast(t: Omit<Toast, 'id'>) {
  for (const listener of listeners) {
    listener(t)
  }
}

/**
 * Dispatch an error toast for any Error, AppError, PluginError, or string.
 */
export function showErrorToast(errorOrMessage: unknown, fallbackTitle = 'An error occurred') {
  let title = fallbackTitle
  let description: string | undefined

  if (typeof errorOrMessage === 'string') {
    description = errorOrMessage
  } else if (errorOrMessage instanceof Error) {
    title = errorOrMessage.name && errorOrMessage.name !== 'Error'
      ? errorOrMessage.name.replace(/([A-Z])/g, ' $1').trim()
      : fallbackTitle
    description = errorOrMessage.message
  } else if (typeof errorOrMessage === 'object' && errorOrMessage !== null) {
    const errObj = errorOrMessage as { message?: string; name?: string; code?: string }
    title = errObj.name || errObj.code || fallbackTitle
    description = errObj.message || String(errorOrMessage)
  } else {
    description = String(errorOrMessage)
  }

  showToast({
    title,
    description,
    variant: 'error',
    duration: 5000,
  })
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be inside DkToastProvider')
  return ctx
}

const variantConfig: Record<string, { icon: typeof CheckCircle; ring: string }> = {
  success: { icon: CheckCircle, ring: 'ring-green-500/30' },
  error: { icon: AlertCircle, ring: 'ring-destructive/30' },
  destructive: { icon: AlertCircle, ring: 'ring-destructive/30' },
  warning: { icon: AlertTriangle, ring: 'ring-orange-500/30' },
  info: { icon: Info, ring: 'ring-blue-500/30' },
  default: { icon: Info, ring: 'ring-[var(--dk-ring-color)]' },
}

const toastAnimation = {
  initial: { opacity: 0, y: 24, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -12, scale: 0.96 },
}

class ToastErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: unknown) {
    console.error('Toast failed to render:', error)
  }
  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

function DkToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    const rawVariant = t.variant || 'default'
    const variant = rawVariant === 'destructive' ? 'error' : rawVariant
    setToasts((prev) => [...prev, { ...t, variant, id }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    listeners.add(addToast)
    return () => {
      listeners.delete(addToast)
    }
  }, [addToast])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}

      <div className="fixed bottom-6 right-6 z-[var(--dk-z-toast)] flex flex-col-reverse gap-3 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <ToastErrorBoundary key={t.id}>
              <ToastItem toast={t} onRemove={removeToast} />
            </ToastErrorBoundary>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast: t, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const config = (t.variant && variantConfig[t.variant]) || variantConfig.default
  const Icon = config?.icon || variantConfig.default.icon

  useEffect(() => {
    const timer = setTimeout(() => onRemove(t.id), t.duration ?? 4000)
    return () => clearTimeout(timer)
  }, [t.id, t.duration, onRemove])

  return (
    <motion.div
      {...toastAnimation}
      transition={{ type: 'spring', damping: 24, stiffness: 320 }}
      layout
      role="alert"
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-2xl p-4 max-w-sm bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-lg)] ring-1 ring-inset',
        config.ring,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">{t.title}</p>
        {t.description && (
          <p className="text-xs text-[var(--muted-foreground)]">{t.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(t.id)}
        className="shrink-0 rounded-lg p-1 transition-all text-[var(--muted-foreground)] hover:bg-[var(--dk-surface-ghost-hover)] hover:text-[var(--foreground)]"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}

export { DkToastProvider }
