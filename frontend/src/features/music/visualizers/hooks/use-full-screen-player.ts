import { useState, useEffect, useCallback, useRef } from 'react'
import type { VisualizerMode } from '../types'
import { getNextVisualizerMode } from '../utils/visualizer-helpers'
import {
  VISUALIZER_MODE_KEY,
  getSavedVisualizerMode,
  saveVisualizerMode,
} from '../utils/visualizer-persistence'

const VISUALIZER_INTENSITY_KEY = 'otix_visualizer_intensity'

export const useFullScreenPlayer = (
  isOpen: boolean,
  onClose: () => void,
  togglePlay?: () => void,
  skipNext?: () => void,
  skipPrevious?: () => void,
  seek?: (ms: number) => void,
  positionMs = 0,
) => {
  const [visualizerMode, setVisualizerModeState] = useState<VisualizerMode>(() =>
    getSavedVisualizerMode(),
  )

  const [intensity, setIntensityState] = useState<number>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(VISUALIZER_INTENSITY_KEY)
      if (saved) {
        const val = parseFloat(saved)
        if (!isNaN(val) && val >= 0.2 && val <= 1.5) return val
      }
    }
    return 1.0
  })

  const [isQueueOpen, setIsQueueOpen] = useState(false)
  const [isControlsVisible, setIsControlsVisible] = useState(true)
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setVisualizerMode = useCallback((mode: VisualizerMode) => {
    setVisualizerModeState(mode)
    saveVisualizerMode(mode)
  }, [])

  const setIntensity = useCallback((val: number) => {
    setIntensityState(val)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(VISUALIZER_INTENSITY_KEY, String(val))
    }
  }, [])

  const cycleVisualizer = useCallback(() => {
    setVisualizerModeState((curr) => {
      const next = getNextVisualizerMode(curr)
      saveVisualizerMode(next)
      return next
    })
  }, [])

  const toggleQueue = useCallback(() => {
    setIsQueueOpen((prev) => !prev)
  }, [])

  // Auto-hide controls after 3.5s of mouse inactivity (cinema mode)
  const resetHideTimer = useCallback(() => {
    setIsControlsVisible(true)
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
    }
    hideTimerRef.current = setTimeout(() => {
      setIsControlsVisible(false)
    }, 3500)
  }, [])

  // Fullscreen API toggle
  const toggleNativeFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsNativeFullscreen(true)
      }).catch(() => {})
    } else {
      document.exitFullscreen().then(() => {
        setIsNativeFullscreen(false)
      }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const handleFsChange = () => {
      setIsNativeFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange)
    }
  }, [])

  // Keyboard navigation when full-screen player is open
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      resetHideTimer()

      if (e.key === 'Escape') {
        e.preventDefault()
        if (isNativeFullscreen && typeof document !== 'undefined') {
          void document.exitFullscreen()
        }
        onClose()
      } else if (e.code === 'Space') {
        e.preventDefault()
        togglePlay?.()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (e.shiftKey) {
          skipNext?.()
        } else {
          seek?.(positionMs + 5000)
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (e.shiftKey) {
          skipPrevious?.()
        } else {
          seek?.(Math.max(0, positionMs - 5000))
        }
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault()
        cycleVisualizer()
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toggleNativeFullscreen()
      } else if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault()
        toggleQueue()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    isOpen,
    isNativeFullscreen,
    onClose,
    togglePlay,
    skipNext,
    skipPrevious,
    seek,
    positionMs,
    cycleVisualizer,
    toggleNativeFullscreen,
    toggleQueue,
    resetHideTimer,
  ])

  useEffect(() => {
    if (!isOpen) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }
      setIsControlsVisible(true)
    } else {
      resetHideTimer()
    }
  }, [isOpen, resetHideTimer])

  return {
    visualizerMode,
    setVisualizerMode,
    cycleVisualizer,
    intensity,
    setIntensity,
    isQueueOpen,
    setIsQueueOpen,
    toggleQueue,
    isControlsVisible,
    resetHideTimer,
    isNativeFullscreen,
    toggleNativeFullscreen,
  }
}
