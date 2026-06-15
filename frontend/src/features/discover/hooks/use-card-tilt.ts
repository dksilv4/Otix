import { useRef, useCallback } from 'react'
import { useMotionValue, useSpring } from 'framer-motion'

export function useCardTilt() {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const tiltZ = useMotionValue(0)
  const rotateX = useSpring(y, { stiffness: 200, damping: 20 })
  const rotateY = useSpring(x, { stiffness: 200, damping: 20 })
  const springTiltZ = useSpring(tiltZ, { stiffness: 200, damping: 20 })
  const isTouchingRef = useRef(false)

  const handleMouseMove = useCallback((e: React.MouseEvent, rect: DOMRect) => {
    if (isTouchingRef.current) return
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    x.set((px - 0.5) * 12)
    y.set((py - 0.5) * -12)
  }, [x, y])

  const handleMouseLeave = useCallback(() => {
    x.set(0)
    y.set(0)
    tiltZ.set(0)
  }, [x, y, tiltZ])

  const handleTouchMove = useCallback((e: React.TouchEvent, rect: DOMRect) => {
    isTouchingRef.current = true
    const touch = e.touches[0]
    const px = (touch.clientX - rect.left) / rect.width
    const py = (touch.clientY - rect.top) / rect.height
    x.set((px - 0.5) * 8)
    y.set((py - 0.5) * -8)
  }, [x, y])

  return {
    style: { rotateX: rotateX as unknown as number, rotateY: rotateY as unknown as number, transformPerspective: 800 },
    handleMouseMove, handleMouseLeave, handleTouchMove,
  }
}
