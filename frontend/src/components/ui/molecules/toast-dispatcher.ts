import { createContext, useContext } from 'react'

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info' | 'destructive'

export interface Toast {
  id: string
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

export interface ToastContextValue {
  toast: (t: Omit<Toast, 'id'>) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export const toastListeners: Set<(t: Omit<Toast, 'id'>) => void> = new Set()

/**
 * Dispatch a toast from anywhere (React or non-React code).
 */
export function showToast(t: Omit<Toast, 'id'>) {
  for (const listener of toastListeners) {
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

const fallbackToastContext: ToastContextValue = {
  toast: (t: Omit<Toast, 'id'>) => {
    showToast(t)
  },
}

export function useOptionalToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  return ctx ?? fallbackToastContext
}
