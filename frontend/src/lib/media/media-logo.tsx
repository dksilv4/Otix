import type { CSSProperties, SyntheticEvent } from 'react'
import { useTheme } from '@/lib/providers/theme'
import { DEFAULT_LOGO_FILTER, logoContrast } from './logo-style'

/**
 * What the logo sits on — drives which monochrome logos get inverted.
 * - 'theme': the viewer theme (hero, anything light-sensitive)
 * - 'dark': an always-dark backdrop (cards scrim behind their logos)
 * - 'light': an always-light backdrop
 * - 'none': no contrast logic, only the base shadow
 */
export type LogoBackground = 'theme' | 'light' | 'dark' | 'none'

interface MediaLogoProps {
  src: string
  alt?: string
  className?: string
  /** Classifier colour guess ('guess_black', 'guess_white', ...). */
  colorGuess?: string | null
  /** Background the logo sits on — drives inversion (defaults to 'theme'). */
  background?: LogoBackground
  /** Override the resolved viewer theme used for `background: 'theme'`. */
  theme?: 'light' | 'dark'
  /** Base drop-shadow; the inversion layers before it when active. */
  shadow?: string
  onError?: (e: SyntheticEvent<HTMLImageElement>) => void
  style?: CSSProperties
}

/**
 * Single reusable logo renderer. Owns the contrast logic once so every surface
 * (hero, cards, launcher) stays in sync, while `background`/`theme`/`shadow`
 * let a specific scope tailor the treatment.
 */
export const MediaLogo = ({
  src,
  alt = '',
  className,
  colorGuess = null,
  background = 'theme',
  theme,
  shadow = DEFAULT_LOGO_FILTER,
  onError,
  style,
}: MediaLogoProps) => {
  const { resolvedTheme } = useTheme()
  const backdrop = background === 'theme' ? (theme ?? resolvedTheme) : background
  const contrast = background === 'none' ? '' : logoContrast(colorGuess, backdrop as 'light' | 'dark')
  const filter = contrast ? `${contrast} ${shadow}` : shadow

  return <img src={src} alt={alt} className={className} onError={onError} style={{ filter, ...style }} />
};
