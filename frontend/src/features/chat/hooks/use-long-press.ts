import { useCallback, useRef } from 'react'
import type { PointerEvent } from 'react'

interface UseLongPressOptions {
  onLongPress: () => void
  threshold?: number
  moveThreshold?: number
  disabled?: boolean
}

export const useLongPress = ({
  onLongPress,
  threshold = 380,
  moveThreshold = 8,
  disabled = false,
}: UseLongPressOptions) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const isTriggeredRef = useRef(false)

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (disabled) return
      // Only primary pointer button (left click on mouse, touch, or pen)
      if (e.button !== 0) return
      // Ignore if clicking interactive inner elements (links, buttons, textarea)
      if ((e.target as HTMLElement).closest('button, a, textarea, input')) return

      isTriggeredRef.current = false
      startPosRef.current = { x: e.clientX, y: e.clientY }

      timerRef.current = setTimeout(() => {
        isTriggeredRef.current = true
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(15)
          } catch {
            // Ignore vibration errors if unsupported
          }
        }
        onLongPress()
      }, threshold)
    },
    [disabled, onLongPress, threshold],
  )

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!startPosRef.current || isTriggeredRef.current) return
      const dx = Math.abs(e.clientX - startPosRef.current.x)
      const dy = Math.abs(e.clientY - startPosRef.current.y)
      if (dx > moveThreshold || dy > moveThreshold) {
        if (timerRef.current) {
          clearTimeout(timerRef.current)
          timerRef.current = null
        }
        startPosRef.current = null
      }
    },
    [moveThreshold],
  )

  const handlePointerCancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startPosRef.current = null
  }, [])

  return {
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerCancel,
      onPointerCancel: handlePointerCancel,
      onPointerLeave: handlePointerCancel,
    },
    isTriggered: () => isTriggeredRef.current,
  }
}
