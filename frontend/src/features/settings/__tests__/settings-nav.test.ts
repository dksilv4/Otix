import { describe, expect, it, beforeEach } from 'vitest'
import {
  DEFAULT_SETTINGS_SECTION,
  NAV_GROUPS,
  NAV_ITEMS,
  SETTINGS_LAST_SECTION_KEY,
  getLastSettingsSection,
  matchNavItem,
  rememberSettingsSection,
} from '../constants'

describe('settings navigation IA', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('groups pages into preferences, library, connections, account, and admin', () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['preferences', 'library', 'connections', 'account', 'admin'])
    expect(NAV_ITEMS.find((i) => i.id === 'appearance')?.group).toBe('preferences')
    expect(NAV_ITEMS.find((i) => i.id === 'launcher')?.group).toBe('preferences')
    expect(NAV_ITEMS.find((i) => i.id === 'desktop')?.group).toBe('preferences')
    expect(NAV_ITEMS.find((i) => i.id === 'desktop')?.desktop).toBe(false)
    expect(NAV_ITEMS.find((i) => i.id === 'library')?.group).toBe('library')
    expect(NAV_ITEMS.find((i) => i.id === 'library')?.desktop).toBe(false)
    expect(NAV_ITEMS.find((i) => i.id === 'downloads')?.group).toBe('library')
    expect(NAV_ITEMS.find((i) => i.id === 'connections')?.label).toBe('Connections')
    expect(NAV_ITEMS.some((i) => i.id === 'overview' || i.id === 'integrations' || i.id === 'general')).toBe(false)
  })

  it('matches sidebar search against labels and keywords', () => {
    const connections = NAV_ITEMS.find((i) => i.id === 'connections')!
    expect(matchNavItem(connections, 'plex')).toBe(true)
    expect(matchNavItem(connections, 'xyzzy')).toBe(false)
    const launcher = NAV_ITEMS.find((i) => i.id === 'launcher')!
    expect(matchNavItem(launcher, 'xbox')).toBe(true)
    expect(matchNavItem(launcher, 'layout')).toBe(true)
    const desktop = NAV_ITEMS.find((i) => i.id === 'desktop')!
    expect(matchNavItem(desktop, 'tray')).toBe(true)
    expect(matchNavItem(desktop, 'startup')).toBe(true)
  })

  it('remembers the last valid section and ignores retired paths', () => {
    rememberSettingsSection('connections')
    expect(localStorage.getItem(SETTINGS_LAST_SECTION_KEY)).toBe('connections')
    rememberSettingsSection('launcher')
    expect(localStorage.getItem(SETTINGS_LAST_SECTION_KEY)).toBe('launcher')
    rememberSettingsSection('desktop')
    expect(localStorage.getItem(SETTINGS_LAST_SECTION_KEY)).toBe('desktop')
    rememberSettingsSection('overview')
    expect(getLastSettingsSection()).toBe('desktop')
    localStorage.clear()
    expect(getLastSettingsSection()).toBe(DEFAULT_SETTINGS_SECTION)
  })
})
