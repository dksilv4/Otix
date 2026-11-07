import { useMemo } from 'react'
import { usePalette, rgbCss, rgbaCss, type ExtractedPalette } from '@/features/activity/hooks/use-palette'

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
}

export const useMusicPalette = (imageUrl: string | null | undefined): MusicPlayerTheme => {
  const palette = usePalette(imageUrl ?? null)
  const hasArtwork = Boolean(imageUrl)

  return useMemo(() => {
    const accentRgb = rgbCss(palette.accent)
    const accentText = palette.accentText
    const accentRgba = (alpha: number) => rgbaCss(palette.accent, alpha)

    const glowShadow = hasArtwork
      ? `0 14px 36px -4px ${rgbaCss(palette.accent, 0.22)}, 0 4px 18px -2px rgba(0, 0, 0, 0.45), var(--dk-shadow-dialog)`
      : 'var(--dk-shadow-dialog)'

    const containerBackground = hasArtwork
      ? `linear-gradient(135deg, ${rgbaCss(palette.surface, 0.88)} 0%, ${rgbaCss(palette.background, 0.94)} 100%)`
      : 'var(--dk-surface-overlay)'

    const podBackground = hasArtwork
      ? `linear-gradient(135deg, ${rgbaCss(palette.surface, 0.65)} 0%, ${rgbaCss(palette.background, 0.85)} 100%)`
      : 'var(--dk-surface-raised)'

    const borderColor = hasArtwork
      ? rgbaCss(palette.accent, 0.16)
      : 'rgba(255, 255, 255, 0.06)'

    const drawerBackdropGradient = hasArtwork
      ? `radial-gradient(ellipse 85% 260px at 50% 0%, ${rgbaCss(palette.accent, 0.12)}, transparent 75%), var(--dk-surface-overlay)`
      : 'var(--dk-surface-overlay)'

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
    }
  }, [palette, hasArtwork])
}
