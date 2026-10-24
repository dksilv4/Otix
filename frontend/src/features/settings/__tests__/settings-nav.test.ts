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
    expect(NAV_ITEMS.find((i) => i.id === 'general')?.group).toBe('preferences')
    expect(NAV_ITEMS.find((i) => i.id === 'appearance')?.group).toBe('preferences')
    expect(NAV_ITEMS.find((i) => i.id === 'recommendations')?.group).toBe('preferences')
    expect(NAV_ITEMS.find((i) => i.id === 'launcher')?.group).toBe('preferences')
    expect(NAV_ITEMS.find((i) => i.id === 'organize')?.group).toBe('library')
    expect(NAV_ITEMS.find((i) => i.id === 'paths')?.group).toBe('library')
    expect(NAV_ITEMS.find((i) => i.id === 'proposals')?.group).toBe('library')
    expect(NAV_ITEMS.find((i) => i.id === 'connections')?.label).toBe('Connections')
    expect(NAV_ITEMS.find((i) => i.id === 'nodes')?.label).toBe('Nodes')
    expect(NAV_ITEMS.find((i) => i.id === 'nodes')?.isPage).toBe(true)
    expect(NAV_ITEMS.find((i) => i.id === 'organize')?.isPage).toBeUndefined()
    expect(NAV_ITEMS.find((i) => i.id === 'paths')?.isPage).toBeUndefined()
    expect(NAV_ITEMS.find((i) => i.id === 'proposals')?.isPage).toBeUndefined()
    const connectionsGroup = NAV_ITEMS.filter((i) => i.group === 'connections')
    expect(connectionsGroup[connectionsGroup.length - 1].id).toBe('nodes')
    expect(NAV_ITEMS.some((i) => i.id === 'overview' || i.id === 'integrations' || i.id === 'downloads' || i.id === 'desktop' || i.id === 'game-servers')).toBe(false)
  })

  it('matches sidebar search against labels and keywords', () => {
    const connections = NAV_ITEMS.find((i) => i.id === 'connections')!
    expect(matchNavItem(connections, 'plex')).toBe(true)
    expect(matchNavItem(connections, 'steam')).toBe(true)
    expect(matchNavItem(connections, 'xyzzy')).toBe(false)
    const nodes = NAV_ITEMS.find((i) => i.id === 'nodes')!
    expect(matchNavItem(nodes, 'otix nodes')).toBe(true)
    expect(matchNavItem(nodes, 'homelab')).toBe(true)
    expect(matchNavItem(nodes, 'servers')).toBe(true)
    expect(matchNavItem(nodes, 'game servers')).toBe(true)
    expect(matchNavItem(nodes, 'valheim')).toBe(true)
    expect(matchNavItem(nodes, 'xyzzy')).toBe(false)
    const organize = NAV_ITEMS.find((i) => i.id === 'organize')!
    expect(matchNavItem(organize, 'folders')).toBe(true)
    expect(matchNavItem(organize, 'xyzzy')).toBe(false)
    const proposals = NAV_ITEMS.find((i) => i.id === 'proposals')!
    expect(matchNavItem(proposals, 'matching')).toBe(true)
    const launcher = NAV_ITEMS.find((i) => i.id === 'launcher')!
    expect(matchNavItem(launcher, 'xbox')).toBe(true)
    expect(matchNavItem(launcher, 'layout')).toBe(true)
  })

  it('remembers the last valid section and ignores retired paths', () => {
    rememberSettingsSection('connections')
    expect(localStorage.getItem(SETTINGS_LAST_SECTION_KEY)).toBe('connections')
    rememberSettingsSection('launcher')
    expect(localStorage.getItem(SETTINGS_LAST_SECTION_KEY)).toBe('launcher')
    rememberSettingsSection('nodes')
    expect(localStorage.getItem(SETTINGS_LAST_SECTION_KEY)).toBe('nodes')
    rememberSettingsSection('desktop')
    expect(localStorage.getItem(SETTINGS_LAST_SECTION_KEY)).toBe('nodes')
    rememberSettingsSection('overview')
    expect(getLastSettingsSection()).toBe('nodes')
    localStorage.clear()
    expect(getLastSettingsSection()).toBe(DEFAULT_SETTINGS_SECTION)
  })
})
