import { describe, expect, it, beforeEach } from 'vitest'
import {
  readWelcomeNavPreference,
  writeWelcomeNavPreference,
  readWelcomeBannerPreference,
  writeWelcomeBannerPreference,
  WELCOME_NAV_STORAGE_KEY,
  WELCOME_BANNER_STORAGE_KEY,
} from '../utils/welcome-preferences'

describe('welcome-preferences utils', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to true when onboardingCompleted is false or undefined and no storage key exists', () => {
    expect(readWelcomeNavPreference(false)).toBe(true)
    expect(readWelcomeNavPreference(undefined)).toBe(true)
    expect(readWelcomeBannerPreference(false)).toBe(true)
    expect(readWelcomeBannerPreference(undefined)).toBe(true)
  })

  it('defaults to false when onboardingCompleted is true and no storage key exists', () => {
    expect(readWelcomeNavPreference(true)).toBe(false)
    expect(readWelcomeBannerPreference(true)).toBe(false)
  })

  it('reads stored preference when localStorage is set regardless of onboardingCompleted', () => {
    writeWelcomeNavPreference(true)
    expect(readWelcomeNavPreference(true)).toBe(true)

    writeWelcomeNavPreference(false)
    expect(readWelcomeNavPreference(false)).toBe(false)

    writeWelcomeBannerPreference(true)
    expect(readWelcomeBannerPreference(true)).toBe(true)

    writeWelcomeBannerPreference(false)
    expect(readWelcomeBannerPreference(false)).toBe(false)
  })

  it('persists written values into localStorage keys', () => {
    writeWelcomeNavPreference(true)
    expect(localStorage.getItem(WELCOME_NAV_STORAGE_KEY)).toBe('true')

    writeWelcomeNavPreference(false)
    expect(localStorage.getItem(WELCOME_NAV_STORAGE_KEY)).toBe('false')

    writeWelcomeBannerPreference(true)
    expect(localStorage.getItem(WELCOME_BANNER_STORAGE_KEY)).toBe('true')

    writeWelcomeBannerPreference(false)
    expect(localStorage.getItem(WELCOME_BANNER_STORAGE_KEY)).toBe('false')
  })
})
