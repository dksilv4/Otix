export interface CarouselSnapOptions {
  currentScrollLeft: number
  dragDistance: number
  velocity: number
  itemWidth: number
  gap: number
  maxScroll: number
}

/**
 * Calculates optimal item width so an integer number of items fit
 * nicely within the available width with regular gaps.
 */
export const calculateCarouselItemWidth = (
  availableWidth: number,
  minItemWidth: number,
  gap: number,
): number => {
  if (availableWidth <= 0) return minItemWidth
  // On small screens, reduce min width so at least 2 cards show
  const effectiveMin = Math.min(minItemWidth, Math.max(140, availableWidth / 2.5))
  const n = Math.max(1, Math.floor((availableWidth + gap) / (effectiveMin + gap)))
  return Math.max(effectiveMin, (availableWidth - (n - 1) * gap) / n)
}

/**
 * Calculates the total page stride in pixels for page-based scrolling.
 */
export const calculateCarouselPageWidth = (
  availableWidth: number,
  itemWidth: number,
  gap: number,
): number => {
  const stride = itemWidth + gap
  if (stride <= 0) return 0
  const n = Math.max(1, Math.floor((availableWidth + gap) / stride))
  return n * stride
}

/**
 * Calculates the target scrollLeft coordinate to snap to the nearest or next card
 * after a gesture or pointer release, taking drag velocity and direction into account.
 */
export const calculateCarouselSnapTarget = ({
  currentScrollLeft,
  dragDistance,
  velocity,
  itemWidth,
  gap,
  maxScroll,
}: CarouselSnapOptions): number => {
  const stride = itemWidth + gap
  if (stride <= 0) return 0

  let targetIndex: number

  // If there was a high-velocity flick or significant drag displacement
  if (velocity < -0.25 || dragDistance < -30) {
    // Flicked / dragged forward (content moved left, scrolling next)
    targetIndex = Math.ceil(currentScrollLeft / stride)
  } else if (velocity > 0.25 || dragDistance > 30) {
    // Flicked / dragged backward (content moved right, scrolling prev)
    targetIndex = Math.floor(currentScrollLeft / stride)
  } else {
    // Released with low velocity -> snap to nearest card
    targetIndex = Math.round(currentScrollLeft / stride)
  }

  const targetScrollLeft = targetIndex * stride
  return Math.max(0, Math.min(targetScrollLeft, maxScroll))
}

/**
 * Measures the total horizontal padding (left + right) of an element.
 */
export const getTrackHorizontalPadding = (element: HTMLElement | null): number => {
  if (!element || typeof window === 'undefined') return 0
  const style = window.getComputedStyle(element)
  return (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
}
