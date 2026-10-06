import { useCallback, useEffect, useRef, useState } from 'react'

export type SlotAction = (pluginId: string, actionKey: string, payload: unknown) => void | Promise<void>

export interface ActionFeedback {
  tone: 'success' | 'error'
  message: string
}

export const useSlotActions = (
  onAction?: SlotAction,
): {
  busy: Record<string, boolean>
  feedback: Record<string, ActionFeedback>
  run: SlotAction
} => {
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [feedback, setFeedback] = useState<Record<string, ActionFeedback>>({})
  const onActionRef = useRef<SlotAction | undefined>(onAction)
  useEffect(() => {
    onActionRef.current = onAction
  }, [onAction])

  const run = useCallback<SlotAction>(async (pluginId, actionKey, payload) => {
    const id = `${pluginId}:${actionKey}`
    setBusy((b) => ({ ...b, [id]: true }))
    setFeedback((f) => {
      const next = { ...f }
      delete next[id]
      return next
    })
    const clear = () => {
      window.setTimeout(() => {
        setFeedback((f) => {
          const next = { ...f }
          delete next[id]
          return next
        })
      }, 4000)
    }
    try {
      const res = await onActionRef.current?.(pluginId, actionKey, payload)
      if (res && typeof res === 'object') {
        const r = res as { success?: boolean; message?: string; error?: string }
        const ok = r.success !== false
        setFeedback((f) => ({
          ...f,
          [id]: { tone: ok ? 'success' : 'error', message: ok ? r.message || 'Done' : r.error || r.message || 'Action failed' },
        }))
        clear()
      }
    } catch (err) {
      setFeedback((f) => ({
        ...f,
        [id]: { tone: 'error', message: err instanceof Error ? err.message : 'Action failed' },
      }))
      clear()
    } finally {
      setBusy((b) => ({ ...b, [id]: false }))
    }
  }, [])

  return { busy, feedback, run }
}
