import { useState, useEffect, useCallback, type RefObject } from 'react'

export interface SmartPlacementResult {
  /** Vertical placement: 'top' renders above the trigger; 'bottom' renders below */
  placement: 'top' | 'bottom'
  /** Horizontal alignment: 'left' aligns to the left edge; 'right' aligns to the right edge */
  align: 'left' | 'right'
  /** Vertical headroom available in pixels */
  spaceAbove: number
  /** Vertical footroom available in pixels */
  spaceBelow: number
}

interface UseSmartPlacementOptions {
  triggerRef: RefObject<HTMLElement | null>
  isOpen: boolean
  minHeadroom?: number
  isOutgoing?: boolean
}

export const useSmartPlacement = ({
  triggerRef,
  isOpen,
  minHeadroom = 46,
  isOutgoing = false,
}: UseSmartPlacementOptions): SmartPlacementResult => {
  const [placement, setPlacement] = useState<'top' | 'bottom'>('top')
  const [align, setAlign] = useState<'left' | 'right'>(isOutgoing ? 'right' : 'left')
  const [spaceAbove, setSpaceAbove] = useState(100)
  const [spaceBelow, setSpaceBelow] = useState(100)

  const updatePlacement = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    // Find nearest scrollable container or fall back to window bounds
    const scrollParent = trigger.closest('.overflow-y-auto') as HTMLElement | null
    const triggerRect = trigger.getBoundingClientRect()
    const containerRect = scrollParent
      ? scrollParent.getBoundingClientRect()
      : {
          top: 0,
          bottom: window.innerHeight,
          left: 0,
          right: window.innerWidth,
        }

    const availableAbove = triggerRect.top - containerRect.top
    const availableBelow = containerRect.bottom - triggerRect.bottom

    setSpaceAbove(availableAbove)
    setSpaceBelow(availableBelow)

    // Flip to bottom if headroom is tighter than minHeadroom AND there is more room below
    if (availableAbove < minHeadroom && availableBelow > availableAbove) {
      setPlacement('bottom')
    } else {
      setPlacement('top')
    }

    // Horizontal clamping: ensure reaction bar stays comfortably within container bounds
    const availableRight = containerRect.right - triggerRect.right
    const availableLeft = triggerRect.left - containerRect.left

    if (isOutgoing) {
      // Outgoing messages are aligned right, but if there's no room to the left for the bar (~220px), align left
      if (triggerRect.right < containerRect.left + 220 && availableRight > availableLeft) {
        setAlign('left')
      } else {
        setAlign('right')
      }
    } else {
      // Incoming messages are aligned left, but if there's no room to the right for the bar, align right
      if (availableRight < 220 && availableLeft > 220) {
        setAlign('right')
      } else {
        setAlign('left')
      }
    }
  }, [triggerRef, minHeadroom, isOutgoing])

  useEffect(() => {
    if (!isOpen) return

    updatePlacement()

    const trigger = triggerRef.current
    const scrollParent = trigger?.closest('.overflow-y-auto')

    const handleScroll = () => updatePlacement()
    const handleResize = () => updatePlacement()

    scrollParent?.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleResize, { passive: true })

    return () => {
      scrollParent?.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
    }
  }, [isOpen, updatePlacement, triggerRef])

  return { placement, align, spaceAbove, spaceBelow }
}
