import { createContext, useContext, useEffect, useState, useMemo, createElement } from 'react'
import type { ReactNode, RefObject } from 'react'
import { NavCenterPill } from '../components/atoms/nav-center-pill'
import type { NavCenterPillProps } from '../components/atoms/nav-center-pill'

export interface NavCenterConfig extends Partial<NavCenterPillProps> {
  /** Unique identifier for the registering component */
  id?: string
  /** Custom ReactNode content (takes precedence over NavCenterPillProps if provided) */
  content?: ReactNode
  /** Explicit visibility toggle (if omitted, computed from scrollThreshold or sentinelRef) */
  visible?: boolean
  /** Scroll position in pixels at which the center pill becomes visible */
  scrollThreshold?: number
  /** Sentinel element ref: pill shows when this sentinel element leaves viewport */
  sentinelRef?: RefObject<HTMLElement | null>
  /** If true, pill only appears when scrolling up past the threshold (hides on scroll down) */
  showOnScrollUpOnly?: boolean
  /** Fallback mode when space between left & right pills is less than 380px: 'sub-tier' (default) or 'hidden' */
  fallbackPlacement?: 'sub-tier' | 'hidden'
  /** Priority if multiple views register a center island (highest number wins) */
  priority?: number
}

export interface NavCenterContextValue {
  centerConfig: NavCenterConfig | null
  setCenterConfig: (config: NavCenterConfig | null) => void
}

export const NavCenterContext = createContext<NavCenterContextValue>({
  centerConfig: null,
  setCenterConfig: () => {},
})

/**
 * Accesses the internal NavCenter context.
 */
export const useNavCenterContext = () => useContext(NavCenterContext)

/**
 * Primary Nav Center API hook.
 *
 * Registers a center island floating header / pill with the navigation shell,
 * with built-in scroll trigger detection, sentinel element observation,
 * and automatic cleanup on unmount.
 *
 * @example
 * ```tsx
 * // Option 1: Declarative media pill
 * useNavCenter({
 *   id: 'media-header',
 *   title: detail.title,
 *   subtitle: year,
 *   thumbnailUrl: detail.posterUrl,
 *   badge: <ScoreBadge score={detail.overallRating} />,
 *   actions: <PlayButton />,
 *   scrollThreshold: 280,
 * })
 *
 * // Option 2: Sentinel element based
 * const heroRef = useRef<HTMLDivElement>(null)
 * useNavCenter({
 *   title: 'Game Library',
 *   sentinelRef: heroRef,
 * })
 * ```
 */
export const useNavCenter = (config: NavCenterConfig | null) => {
  const { setCenterConfig } = useContext(NavCenterContext)
  const [internalVisible, setInternalVisible] = useState(false)

  // 1. Sentinel element observer
  useEffect(() => {
    if (!config || !config.sentinelRef?.current || config.visible !== undefined) return

    const element = config.sentinelRef.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Pill is visible when the sentinel has scrolled out of view at the top
        const isPastSentinel = !entry.isIntersecting && entry.boundingClientRect.top < 0
        setInternalVisible(isPastSentinel)
      },
      { threshold: 0, rootMargin: '-60px 0px 0px 0px' },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [config?.sentinelRef, config?.visible])

  // 2. Scroll threshold & direction listener
  useEffect(() => {
    if (!config || config.scrollThreshold == null || config.visible !== undefined || config.sentinelRef) {
      return
    }

    let lastScrollY = window.scrollY

    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const isPastThreshold = currentScrollY >= (config.scrollThreshold ?? 250)

      if (config.showOnScrollUpOnly) {
        const isScrollingUp = currentScrollY < lastScrollY
        setInternalVisible(isPastThreshold && isScrollingUp)
      } else {
        setInternalVisible(isPastThreshold)
      }

      lastScrollY = currentScrollY
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [config?.scrollThreshold, config?.showOnScrollUpOnly, config?.visible, config?.sentinelRef])

  // Resolved final configuration
  const resolvedConfig = useMemo(() => {
    if (!config) return null

    const isVisible = config.visible !== undefined ? config.visible : internalVisible

    // If explicit content is provided, use it; otherwise build NavCenterPill if title is present
    let contentNode = config.content
    if (!contentNode && config.title) {
      contentNode = createElement(NavCenterPill, {
        title: config.title,
        subtitle: config.subtitle,
        thumbnailUrl: config.thumbnailUrl,
        thumbnailPlaceholder: config.thumbnailPlaceholder,
        badge: config.badge,
        actions: config.actions,
        onTitleClick: config.onTitleClick,
      })
    }

    return {
      ...config,
      visible: isVisible,
      content: contentNode,
    }
  }, [config, internalVisible])

  useEffect(() => {
    if (!resolvedConfig) return
    setCenterConfig(resolvedConfig)
    return () => {
      setCenterConfig(null)
    }
  }, [resolvedConfig, setCenterConfig])
}
