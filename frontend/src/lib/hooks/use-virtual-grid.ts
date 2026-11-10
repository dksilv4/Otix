import { useState, useEffect, useRef, useMemo, useCallback } from 'react'

export interface VirtualRowItem<T> {
  index: number
  item: T
  offset: number
}

export interface UseVirtualRowOptions {
  itemWidth: number
  gap?: number
  overscan?: number
  threshold?: number
}

export interface UseVirtualRowReturn<T> {
  virtualItems: VirtualRowItem<T>[]
  totalWidth: number
  paddingStart: number
  paddingEnd: number
  isVirtualized: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void
}

/**
 * Lightweight virtualization hook for horizontal ribbon/carousel layouts.
 * Bounds mounted DOM elements to visible viewport + overscan buffer (~15-25 cards).
 */
export const useVirtualRow = <T,>(
  items: T[],
  options: UseVirtualRowOptions,
): UseVirtualRowReturn<T> => {
  const { itemWidth, gap = 16, overscan = 3, threshold = 24 } = options
  const containerRef = useRef<HTMLDivElement | null>(null)
  const itemSize = itemWidth + gap

  const [scrollState, setScrollState] = useState(() => ({
    scrollLeft: 0,
    clientWidth: typeof window !== 'undefined' ? window.innerWidth : 1200,
  }))

  const isVirtualized = items.length > threshold

  useEffect(() => {
    const element = containerRef.current
    if (!element || !isVirtualized) return

    let rafId: number | null = null

    const updateMetrics = () => {
      setScrollState((prev) => {
        const nextLeft = element.scrollLeft
        const nextWidth = element.clientWidth
        if (prev.scrollLeft === nextLeft && prev.clientWidth === nextWidth) {
          return prev
        }
        return { scrollLeft: nextLeft, clientWidth: nextWidth }
      })
    }

    const onScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        updateMetrics()
      })
    }

    // Initial measurement
    updateMetrics()

    element.addEventListener('scroll', onScroll, { passive: true })
    const resizeObserver = new ResizeObserver(() => {
      updateMetrics()
    })
    resizeObserver.observe(element)

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      element.removeEventListener('scroll', onScroll)
      resizeObserver.disconnect()
    }
  }, [isVirtualized])

  const totalWidth = useMemo(() => {
    if (items.length === 0) return 0
    return items.length * itemSize - gap
  }, [items.length, itemSize, gap])

  const { virtualItems, paddingStart, paddingEnd } = useMemo(() => {
    if (!isVirtualized) {
      return {
        virtualItems: items.map((item, index) => ({
          index,
          item,
          offset: index * itemSize,
        })),
        paddingStart: 0,
        paddingEnd: 0,
      }
    }

    const { scrollLeft, clientWidth } = scrollState
    const startIdx = Math.max(0, Math.floor(scrollLeft / itemSize) - overscan)
    const endIdx = Math.min(
      items.length,
      Math.ceil((scrollLeft + clientWidth) / itemSize) + overscan,
    )

    const slice = items.slice(startIdx, endIdx).map((item, idx) => ({
      index: startIdx + idx,
      item,
      offset: (startIdx + idx) * itemSize,
    }))

    const startPad = startIdx * itemSize
    const endPad = Math.max(0, (items.length - endIdx) * itemSize)

    return {
      virtualItems: slice,
      paddingStart: startPad,
      paddingEnd: endPad,
    }
  }, [items, isVirtualized, itemSize, scrollState, overscan])

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const element = containerRef.current
      if (!element || index < 0 || index >= items.length) return
      const targetLeft = index * itemSize - (element.clientWidth - itemWidth) / 2
      element.scrollTo({
        left: Math.max(0, targetLeft),
        behavior,
      })
    },
    [items.length, itemSize, itemWidth],
  )

  return {
    virtualItems,
    totalWidth,
    paddingStart,
    paddingEnd,
    isVirtualized,
    containerRef,
    scrollToIndex,
  }
}

export interface VirtualGridItem<T> {
  index: number
  item: T
  rowIndex: number
  columnIndex: number
}

export interface UseVirtualGridOptions {
  itemHeight: number
  columns?: number | ((width: number) => number)
  gap?: number
  overscanRows?: number
  threshold?: number
  windowScroll?: boolean
}

export interface UseVirtualGridReturn<T> {
  virtualItems: VirtualGridItem<T>[]
  totalHeight: number
  paddingTop: number
  paddingBottom: number
  isVirtualized: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  columns: number
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void
}

/**
 * Helper to find the scrollable ancestor of an element.
 */
const getScrollParent = (node: HTMLElement | null): HTMLElement | Window => {
  if (typeof window === 'undefined' || !node) return window
  let parent = node.parentElement
  while (parent && parent !== document.body) {
    const style = window.getComputedStyle(parent)
    const overflowY = style.overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return parent
    }
    parent = parent.parentElement
  }
  return window
}

/**
 * Lightweight virtualization hook for CSS Grid and vertical item collections.
 * Automatically resolves scrollable parent or window, maintaining natural
 * CSS Grid flow using full-span spacers (`gridColumn: 1 / -1`).
 */
export const useVirtualGrid = <T,>(
  items: T[],
  options: UseVirtualGridOptions,
): UseVirtualGridReturn<T> => {
  const {
    itemHeight,
    columns: columnsOption = 5,
    gap = 20,
    overscanRows = 2,
    threshold = 24,
    windowScroll = false,
  } = options

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollState, setScrollState] = useState(() => ({
    scrollTop: 0,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 900,
    containerWidth: typeof window !== 'undefined' ? window.innerWidth : 1200,
  }))

  const isVirtualized = items.length > threshold

  const resolvedColumns = useMemo(() => {
    if (typeof columnsOption === 'function') {
      return Math.max(1, columnsOption(scrollState.containerWidth))
    }
    return Math.max(1, columnsOption)
  }, [columnsOption, scrollState.containerWidth])

  const rowHeight = itemHeight + gap

  useEffect(() => {
    const container = containerRef.current
    if (!container || !isVirtualized) return

    let rafId: number | null = null
    const scrollParent = windowScroll ? window : getScrollParent(container)

    const updateMetrics = () => {
      const containerEl = containerRef.current
      if (!containerEl) return

      let scrollTop = 0
      let viewportHeight = window.innerHeight
      const containerWidth = containerEl.clientWidth || window.innerWidth

      if (scrollParent === window) {
        const rect = containerEl.getBoundingClientRect()
        scrollTop = Math.max(0, -rect.top)
        viewportHeight = window.innerHeight
      } else {
        const parentEl = scrollParent as HTMLElement
        const containerRect = containerEl.getBoundingClientRect()
        const parentRect = parentEl.getBoundingClientRect()
        scrollTop = Math.max(0, parentRect.top - containerRect.top)
        viewportHeight = parentEl.clientHeight
      }

      setScrollState((prev) => {
        if (
          prev.scrollTop === scrollTop &&
          prev.viewportHeight === viewportHeight &&
          prev.containerWidth === containerWidth
        ) {
          return prev
        }
        return { scrollTop, viewportHeight, containerWidth }
      })
    }

    const onScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        updateMetrics()
      })
    }

    updateMetrics()

    scrollParent.addEventListener('scroll', onScroll, { passive: true })
    const resizeObserver = new ResizeObserver(() => {
      updateMetrics()
    })
    resizeObserver.observe(container)

    const onWindowResize = () => updateMetrics()
    window.addEventListener('resize', onWindowResize, { passive: true })

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      scrollParent.removeEventListener('scroll', onScroll)
      resizeObserver.disconnect()
      window.removeEventListener('resize', onWindowResize)
    }
  }, [isVirtualized, windowScroll])

  const totalRows = Math.ceil(items.length / resolvedColumns)
  const totalHeight = totalRows > 0 ? totalRows * rowHeight - gap : 0

  const { virtualItems, paddingTop, paddingBottom } = useMemo(() => {
    if (!isVirtualized) {
      return {
        virtualItems: items.map((item, index) => ({
          index,
          item,
          rowIndex: Math.floor(index / resolvedColumns),
          columnIndex: index % resolvedColumns,
        })),
        paddingTop: 0,
        paddingBottom: 0,
      }
    }

    const { scrollTop, viewportHeight } = scrollState
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows)
    const endRow = Math.min(
      totalRows,
      Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscanRows,
    )

    const startIdx = startRow * resolvedColumns
    const endIdx = Math.min(items.length, endRow * resolvedColumns)

    const slice = items.slice(startIdx, endIdx).map((item, idx) => {
      const actualIdx = startIdx + idx
      return {
        index: actualIdx,
        item,
        rowIndex: Math.floor(actualIdx / resolvedColumns),
        columnIndex: actualIdx % resolvedColumns,
      }
    })

    const topPad = startRow * rowHeight
    const bottomPad = Math.max(0, (totalRows - endRow) * rowHeight)

    return {
      virtualItems: slice,
      paddingTop: topPad,
      paddingBottom: bottomPad,
    }
  }, [items, isVirtualized, resolvedColumns, rowHeight, scrollState, overscanRows, totalRows])

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      if (index < 0 || index >= items.length) return
      const targetRow = Math.floor(index / resolvedColumns)
      const targetTop = targetRow * rowHeight

      if (windowScroll) {
        const container = containerRef.current
        if (!container) return
        const rect = container.getBoundingClientRect()
        const absoluteTop = window.scrollY + rect.top + targetTop
        window.scrollTo({
          top: Math.max(0, absoluteTop),
          behavior,
        })
      } else {
        const container = containerRef.current
        if (!container) return
        container.scrollTo({
          top: Math.max(0, targetTop),
          behavior,
        })
      }
    },
    [items.length, resolvedColumns, rowHeight, windowScroll],
  )

  return {
    virtualItems,
    totalHeight,
    paddingTop,
    paddingBottom,
    isVirtualized,
    containerRef,
    columns: resolvedColumns,
    scrollToIndex,
  }
}
