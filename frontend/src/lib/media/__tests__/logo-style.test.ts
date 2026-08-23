import { describe, expect, it } from 'vitest'

import { DEFAULT_LOGO_FILTER, logoContrast } from '../logo-style'

describe('logoContrast', () => {
  it('inverts a black logo on a dark background so it is visible', () => {
    expect(logoContrast('guess_black', 'dark')).toBe('invert(1)')
  })

  it('inverts a white logo on a light background', () => {
    expect(logoContrast('guess_white', 'light')).toBe('invert(1)')
  })

  it('returns no transform for matching-contrast monochrome logos', () => {
    expect(logoContrast('guess_black', 'light')).toBe('')
    expect(logoContrast('guess_white', 'dark')).toBe('')
  })

  it('never inverts colourful, gray or unknown logos', () => {
    expect(logoContrast('guess_multicolor', 'dark')).toBe('')
    expect(logoContrast('guess_colorful', 'dark')).toBe('')
    expect(logoContrast('guess_gray', 'dark')).toBe('')
    expect(logoContrast(null, 'dark')).toBe('')
  })
})

describe('DEFAULT_LOGO_FILTER', () => {
  it('is the neutral fallback shadow', () => {
    expect(DEFAULT_LOGO_FILTER).toBe('drop-shadow(0 2px 8px rgba(0,0,0,0.5))')
  })
})
