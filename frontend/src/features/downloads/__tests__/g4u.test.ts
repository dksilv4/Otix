import { describe, it, expect } from 'vitest'
import { isG4UConfigured, buildG4URSSUrl, isUpdateRelease } from '../usenet-utils'
import type { ServerProwlarrRelease } from '../usenet-types'

describe('g4u.to utilities', () => {
  describe('isG4UConfigured', () => {
    it('returns false for null/undefined/empty config', () => {
      expect(isG4UConfigured(null)).toBe(false)
      expect(isG4UConfigured(undefined)).toBe(false)
      expect(isG4UConfigured({})).toBe(false)
    })

    it('returns true when apiKey is present', () => {
      expect(isG4UConfigured({ apiKey: 'my-key' })).toBe(true)
      expect(isG4UConfigured({ api_key: 'my-key' })).toBe(true)
    })

    it('returns true when configured flag or hasApiKey flag is true', () => {
      expect(isG4UConfigured({ configured: true })).toBe(true)
      expect(isG4UConfigured({ hasApiKey: true })).toBe(true)
      expect(isG4UConfigured({ has_api_key: true })).toBe(true)
    })
  })

  describe('buildG4URSSUrl', () => {
    it('builds standard RSS feed URL with default endpoint', () => {
      const url = buildG4URSSUrl('', 'SECRET_KEY')
      expect(url).toBe('https://g4u.to/api/?t=search&limit=50&apikey=SECRET_KEY')
    })

    it('normalizes base url ending without /api or without trailing slash', () => {
      const url1 = buildG4URSSUrl('https://g4u.to', 'KEY123')
      expect(url1).toBe('https://g4u.to/api/?t=search&limit=50&apikey=KEY123')

      const url2 = buildG4URSSUrl('https://custom-mirror.org/api', 'KEY456')
      expect(url2).toBe('https://custom-mirror.org/api/?t=search&limit=50&apikey=KEY456')
    })

    it('uses placeholder when apikey is missing', () => {
      const url = buildG4URSSUrl('https://g4u.to/api/', '')
      expect(url).toBe('https://g4u.to/api/?t=search&limit=50&apikey=DEIN-KEY')
    })
  })

  describe('isUpdateRelease', () => {
    it('identifies release with guid prefix e as update', () => {
      const release: Partial<ServerProwlarrRelease> = {
        guid: 'e12345',
        title: 'Cyberpunk 2077',
      }
      expect(isUpdateRelease(release)).toBe(true)
    })

    it('identifies release with guid prefix r as base release unless title indicates otherwise', () => {
      const release: Partial<ServerProwlarrRelease> = {
        guid: 'r12345',
        title: 'Cyberpunk 2077 v2.13-GOG',
      }
      expect(isUpdateRelease(release)).toBe(false)
    })

    it('identifies update from title keywords (update, patch, hotfix, dlc)', () => {
      expect(isUpdateRelease({ guid: 'r111', title: 'Game.Title.Update.v1.2-CODEX' })).toBe(true)
      expect(isUpdateRelease({ guid: 'r222', title: 'Game.Title.Day1.Patch-RUNE' })).toBe(true)
      expect(isUpdateRelease({ guid: 'r333', title: 'Game.Title.Hotfix.1-FLT' })).toBe(true)
      expect(isUpdateRelease({ guid: 'r444', title: 'Game.Title.DLC.Pack-ElAmigos' })).toBe(true)
      expect(isUpdateRelease({ guid: 'r555', title: 'Game.Title.Complete.Edition-GOG' })).toBe(false)
    })
  })
})
