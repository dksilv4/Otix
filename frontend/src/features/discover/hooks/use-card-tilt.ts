import { useRef, useCallback, useEffect } from 'react'
import { useMotionValue, useSpring, animate } from 'framer-motion'

export function useCardTilt(isActive: boolean = false) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const tiltZ = useMotionValue(0)
  const rotateX = useSpring(y, { stiffness: 200, damping: 20 })
  const rotateY = useSpring(x, { stiffness: 200, damping: 20 })
  const springTiltZ = useSpring(tiltZ, { stiffness: 200, damping: 20 })
  const isTouchingRef = useRef(false)
  const isHoveringRef = useRef(false)
  const animationXRef = useRef<any>(null)
  const animationYRef = useRef<any>(null)

  const stopAutoTilt = useCallback(() => {
    if (animationXRef.current) {
      animationXRef.current.stop()
      animationXRef.current = null
    }
    if (animationYRef.current) {
      animationYRef.current.stop()
      animationYRef.current = null
    }
  }, [])

  const startAutoTilt = useCallback(() => {
    stopAutoTilt()
    if (!isActive) return

    // Run gentle continuous oscillation (Lissajous pattern)
    // We animate x and y with slightly different durations for a natural, organic movement
    animationXRef.current = animate(x, [-3.5, 3.5, -3.5], {
      duration: 6.5,
      ease: 'easeInOut',
      repeat: Infinity,
    })
    animationYRef.current = animate(y, [-3, 3, -3], {
      duration: 8.5,
      ease: 'easeInOut',
      repeat: Infinity,
    })
  }, [isActive, x, y, stopAutoTilt])

  const handleMouseMove = useCallback((e: React.MouseEvent, rect: DOMRect) => {
    if (isTouchingRef.current) return
    isHoveringRef.current = true
    stopAutoTilt()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    x.set((px - 0.5) * 12)
    y.set((py - 0.5) * -12)
  }, [x, y, stopAutoTilt])

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false
    x.set(0)
    y.set(0)
    tiltZ.set(0)
    // Resume auto-tilt if card is still active
    startAutoTilt()
  }, [x, y, tiltZ, startAutoTilt])

  const handleTouchStart = useCallback((e: React.TouchEvent, rect: DOMRect) => {
    isTouchingRef.current = true
    stopAutoTilt()
    const touch = e.touches[0]
    const px = (touch.clientX - rect.left) / rect.width
    const py = (touch.clientY - rect.top) / rect.height
    x.set((px - 0.5) * 8)
    y.set((py - 0.5) * -8)
  }, [x, y, stopAutoTilt])

  const handleTouchMove = useCallback((e: React.TouchEvent, rect: DOMRect) => {
    if (!isTouchingRef.current) return
    const touch = e.touches[0]
    const px = (touch.clientX - rect.left) / rect.width
    const py = (touch.clientY - rect.top) / rect.height
    x.set((px - 0.5) * 8)
    y.set((py - 0.5) * -8)
  }, [x, y])

  const handleTouchEnd = useCallback(() => {
    isTouchingRef.current = false
    x.set(0)
    y.set(0)
    tiltZ.set(0)
    startAutoTilt()
  }, [x, y, tiltZ, startAutoTilt])

  // Manage auto-tilt lifecycle based on active state and interaction status
  useEffect(() => {
    if (isActive && !isHoveringRef.current && !isTouchingRef.current) {
      startAutoTilt()
    } else {
      stopAutoTilt()
      x.set(0)
      y.set(0)
    }

    return () => {
      stopAutoTilt()
    }
  }, [isActive, startAutoTilt, stopAutoTilt, x, y])

  return {
    style: { rotateX: rotateX as unknown as number, rotateY: rotateY as unknown as number, transformPerspective: 800 },
    handleMouseMove,
    handleMouseLeave,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  }
}
