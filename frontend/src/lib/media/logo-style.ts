/**
 * Default drop-shadow applied to a media logo regardless of contrast. Consumer
 * components (cards, heroes) may layer their own depth shadows on top of it.
 */
export const DEFAULT_LOGO_FILTER = 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))'

/**
 * Contrast transform for a monochrome logo that would otherwise vanish against
 * its background. A black logo on a dark background (or a white logo on a light
 * one) is effectively invisible — `invert(1)` flips the artwork so the logo
 * matches the background (black → white on dark, white → black on light).
 *
 * Only pure monochrome guesses (`guess_black`/`guess_white`) invert. Colourful,
 * multicolor and gray logos already carry their own contrast and are left
 * untouched.
 */
export function logoContrast(colorGuess: string | null, background: 'light' | 'dark'): string {
  if (colorGuess === 'guess_black' && background === 'dark') {
    return 'invert(1)'
  }
  if (colorGuess === 'guess_white' && background === 'light') {
    return 'invert(1)'
  }
  return ''
}
