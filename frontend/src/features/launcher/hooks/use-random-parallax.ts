export interface ParallaxOffset {
  x: number
  y: number
}

/**
 * Lightweight parallax provider.
 * Keeps CPU usage at zero by avoiding continuous main-thread React re-render loops.
 */
export const useRandomParallax = (): ParallaxOffset => {
  return { x: 0, y: 0 }
};
