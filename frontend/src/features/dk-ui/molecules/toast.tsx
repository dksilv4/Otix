import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import './toast.scss'

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

const toastAnimation = {
  initial: { opacity: 0, y: 24, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -12, scale: 0.96 },
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

      <div className="dk-toast-container">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onRemove={removeToast} />
          ))}
        </AnimatePresence>
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
    <motion.div
      {...toastAnimation}
      transition={{ type: 'spring', damping: 24, stiffness: 320 }}
      layout
      role="alert"
      className={cn(
        'dk-toast',
        config.ring,
      )}
    >
      <Icon className="dk-toast__icon" />
      <div className="dk-toast__content">
        <p className="dk-toast__title">{t.title}</p>
        {t.description && (
          <p className="dk-toast__description">{t.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(t.id)}
        className="dk-toast__dismiss"
        aria-label="Dismiss"
      >
        <X className="dk-toast__dismiss-icon" />
      </button>
    </motion.div>
  )
}

export { DkToastProvider }
