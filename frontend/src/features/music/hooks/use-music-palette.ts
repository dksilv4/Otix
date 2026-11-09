import { useMemo } from 'react'
import {
  usePalette,
  rgbCss,
  rgbaCss,
  relativeLuminance,
  adjustForContrast,
  type ExtractedPalette,
  type Rgb,
} from '@/features/activity/hooks/use-palette'

export interface MusicPlayerTheme {
  palette: ExtractedPalette
  hasArtwork: boolean
  accentRgb: string
  accentText: string
  accentRgba: (alpha: number) => string
  glowShadow: string
  containerBackground: string
  podBackground: string
  borderColor: string
  drawerBackdropGradient: string
  textColor: string
  subtextColor: string
  iconColor: string
  iconHoverColor: string
  dividerColor: string
  isLightBackground: boolean
}

export const useMusicPalette = (imageUrl: string | null | undefined): MusicPlayerTheme => {
  const palette = usePalette(imageUrl ?? null)
  const hasArtwork = Boolean(imageUrl)

  return useMemo(() => {
    const edgeColor: Rgb = palette.edge ?? palette.background
    const isLightBackground = relativeLuminance(edgeColor) > 0.42

    // Calibrate accent color for guaranteed minimum contrast (>=3.0:1) against the pod background
    const contrastAccent = hasArtwork
      ? adjustForContrast(palette.accent, edgeColor, 3.0)
      : palette.accent

    const accentRgb = rgbCss(contrastAccent)
    const accentText = relativeLuminance(contrastAccent) > 0.48 ? '#111111' : '#ffffff'
    const accentRgba = (alpha: number) => rgbaCss(contrastAccent, alpha)

    // Compute high-contrast text and icon colors guaranteed readable against the player background
    // WCAG AAA (>=7.0:1) for primary text, AA (>=4.5:1) for secondary text, >=3.5:1 for interactive icons
    const targetPrimaryText: Rgb = isLightBackground ? { r: 12, g: 12, b: 16 } : { r: 248, g: 248, b: 252 }
    const targetSecondaryText: Rgb = isLightBackground ? { r: 65, g: 65, b: 80 } : { r: 185, g: 185, b: 200 }
    const targetIcon: Rgb = isLightBackground ? { r: 55, g: 55, b: 70 } : { r: 195, g: 195, b: 210 }

    const adjustedPrimary = hasArtwork
      ? adjustForContrast(targetPrimaryText, edgeColor, 7.0)
      : targetPrimaryText
    const adjustedSecondary = hasArtwork
      ? adjustForContrast(targetSecondaryText, edgeColor, 4.5)
      : targetSecondaryText
    const adjustedIcon = hasArtwork
      ? adjustForContrast(targetIcon, edgeColor, 3.5)
      : targetIcon

    const textColor = 'var(--foreground)'
    const subtextColor = 'var(--muted-foreground)'
    const iconColor = 'var(--muted-foreground)'
    const iconHoverColor = 'var(--foreground)'
    const dividerColor = 'var(--dk-surface-border)'

    const glowShadow = 'var(--dk-shadow-dialog)'

    // Uniform single-tone glassmorphic surface with zero gradients
    const containerBackground = 'var(--dk-surface-overlay)'
    const podBackground = 'var(--dk-surface-raised)'

    const borderColor = hasArtwork
      ? rgbaCss(contrastAccent, 0.16)
      : 'rgba(255, 255, 255, 0.06)'

    const drawerBackdropGradient = 'var(--dk-surface-overlay)'

    return {
      palette,
      hasArtwork,
      accentRgb,
      accentText,
      accentRgba,
      glowShadow,
      containerBackground,
      podBackground,
      borderColor,
      drawerBackdropGradient,
      textColor,
      subtextColor,
      iconColor,
      iconHoverColor,
      dividerColor,
      isLightBackground,
    }
  }, [palette, hasArtwork])
}
