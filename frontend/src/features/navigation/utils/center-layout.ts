export interface CenterPlacementParams {
  windowWidth: number
  leftRect: DOMRect | null
  rightRect: DOMRect | null
  minWidth?: number
  gap?: number
}

export interface CenterPlacementResult {
  placement: 'between' | 'sub-tier' | 'hidden'
  center: number
  maxWidth: number
  availableSpace: number
}

const DEFAULT_MIN_WIDTH = 380
const DEFAULT_GAP = 12

/**
 * Calculates whether a center island can fit between left and right floating nav pills,
 * and computes its center coordinate and max allowable width.
 */
export const calculateCenterPlacement = ({
  windowWidth,
  leftRect,
  rightRect,
  minWidth = DEFAULT_MIN_WIDTH,
  gap = DEFAULT_GAP,
}: CenterPlacementParams): CenterPlacementResult => {
  const leftEdge = leftRect ? leftRect.right + gap : 16
  const rightEdge = rightRect ? rightRect.left - gap : windowWidth - 16
  const availableSpace = Math.max(0, rightEdge - leftEdge)

  if (windowWidth >= 768 && availableSpace >= minWidth) {
    return {
      placement: 'between',
      center: (leftEdge + rightEdge) / 2,
      maxWidth: availableSpace,
      availableSpace,
    }
  }

  return {
    placement: 'sub-tier',
    center: windowWidth / 2,
    maxWidth: Math.min(windowWidth - 32, 480),
    availableSpace,
  }
}

/**
 * Calculates progressive collision progress (0 = resting in page, 1 = fully docked at nav line).
 */
export const calculateCollisionProgress = (
  containerTop: number,
  navTop: number,
  morphDistance = 80
): number => {
  const distanceToNav = containerTop - navTop
  if (distanceToNav >= morphDistance) return 0
  if (distanceToNav <= 0) return 1
  return Math.min(Math.max((morphDistance - distanceToNav) / morphDistance, 0), 1)
}

/**
 * Interpolates container width between full in-page width and docked center width based on collision progress.
 */
export const calculateMorphWidth = (
  fullWidth: number,
  dockedWidth: number,
  progress: number
): number => {
  return fullWidth - progress * (fullWidth - dockedWidth)
}

/**
 * Interpolates container height between full in-page height and colliding pill height (44px) based on collision progress.
 */
export const calculateMorphHeight = (
  fullHeight: number,
  dockedHeight: number,
  progress: number
): number => {
  return fullHeight - progress * (fullHeight - dockedHeight)
}
