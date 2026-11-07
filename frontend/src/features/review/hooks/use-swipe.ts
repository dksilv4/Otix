import { useState, useRef, useCallback } from "react"

interface SwipeState {
  translateX: number
  isSwiping: boolean
  direction: "left" | "right" | null
}

interface UseSwipeOptions {
  threshold?: number       // px to trigger action reveal (default 80)
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
}

function useSwipe({ threshold = 80, onSwipeLeft, onSwipeRight }: UseSwipeOptions = {}) {
  const [state, setState] = useState<SwipeState>({
    translateX: 0,
    isSwiping: false,
    direction: null,
  })
  const startXRef = useRef(0)
  const currentXRef = useRef(0)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX
    setState({ translateX: 0, isSwiping: true, direction: null })
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!state.isSwiping) return
    const deltaX = e.touches[0].clientX - startXRef.current
    currentXRef.current = deltaX
    setState({
      translateX: deltaX,
      isSwiping: true,
      direction: deltaX > 0 ? "right" : deltaX < 0 ? "left" : null,
    })
  }, [state.isSwiping])

  const onTouchEnd = useCallback(() => {
    const deltaX = currentXRef.current
    const snapped = Math.abs(deltaX) >= threshold

    if (snapped) {
      if (deltaX < 0) {
        setState({ translateX: -threshold, isSwiping: false, direction: "left" })
        onSwipeLeft?.()
      } else if (deltaX > 0) {
        setState({ translateX: threshold, isSwiping: false, direction: "right" })
        onSwipeRight?.()
      }
    } else {
      setState({ translateX: 0, isSwiping: false, direction: null })
    }
    currentXRef.current = 0
  }, [threshold, onSwipeLeft, onSwipeRight])

  const reset = useCallback(() => {
    setState({ translateX: 0, isSwiping: false, direction: null })
    currentXRef.current = 0
  }, [])

  return {
    ...state,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    reset,
  }
}

export { useSwipe }
