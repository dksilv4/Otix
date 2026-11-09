import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMusicPalette } from '../use-music-palette'

describe('useMusicPalette', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns default fallback theme when no artwork URL is provided', () => {
    const { result } = renderHook(() => useMusicPalette(null))

    expect(result.current.hasArtwork).toBe(false)
    expect(result.current.containerBackground).toBe('var(--dk-surface-overlay)')
    expect(result.current.podBackground).toBe('var(--dk-surface-raised)')
    expect(result.current.glowShadow).toBe('var(--dk-shadow-dialog)')
    expect(result.current.borderColor).toBe('rgba(255, 255, 255, 0.06)')
    expect(result.current.drawerBackdropGradient).toBe('var(--dk-surface-overlay)')
    expect(result.current.textColor).toBe('var(--foreground)')
    expect(result.current.subtextColor).toBe('var(--muted-foreground)')
    expect(result.current.iconColor).toBe('var(--muted-foreground)')
  })

  it('computes uniform glassmorphic surface, ambient glow, and micro-border when artwork is present', () => {
    const { result } = renderHook(() => useMusicPalette('https://example.com/art.jpg'))

    expect(result.current.hasArtwork).toBe(true)
    expect(result.current.containerBackground).toBe('var(--dk-surface-overlay)')
    expect(result.current.podBackground).toBe('var(--dk-surface-raised)')
    expect(result.current.glowShadow).toContain('var(--dk-shadow-dialog)')
    expect(result.current.drawerBackdropGradient).toBe('var(--dk-surface-overlay)')
    expect(result.current.accentRgb).toContain('rgb(')
    expect(result.current.accentRgba(0.5)).toContain('rgba(')
    expect(result.current.accentRgba(0.5)).toContain('0.5)')
    expect(result.current.textColor).toBe('var(--foreground)')
    expect(result.current.subtextColor).toBe('var(--muted-foreground)')
    expect(result.current.iconColor).toBe('var(--muted-foreground)')
  })

  it('handles blob URLs properly', () => {
    const { result } = renderHook(() => useMusicPalette('blob:http://localhost:5173/test-blob-123'))

    expect(result.current.hasArtwork).toBe(true)
    expect(result.current.accentRgb).toBeDefined()
    expect(result.current.accentText).toMatch(/#111111|#ffffff/)
  })
})
