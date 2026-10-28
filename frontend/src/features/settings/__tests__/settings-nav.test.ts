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
    expect(NAV_ITEMS.find((i) => i.id === 'about')?.group).toBe('preferences')
    expect(NAV_ITEMS.find((i) => i.id === 'about')?.label).toBe('About')
    expect(NAV_ITEMS.find((i) => i.id === 'connections')?.label).toBe('Connections')
    expect(NAV_ITEMS.find((i) => i.id === 'node-connections')?.label).toBe('Node Connections')
    expect(NAV_ITEMS.find((i) => i.id === 'node-connections')?.group).toBe('connections')
    expect(NAV_ITEMS.find((i) => i.id === 'nodes')?.label).toBe('Nodes')
    expect(NAV_ITEMS.find((i) => i.id === 'nodes')?.isPage).toBe(true)
    expect(NAV_ITEMS.find((i) => i.id === 'nodes')?.group).toBe('library')
    expect(NAV_ITEMS.filter((i) => i.group === 'library').map((i) => i.id)).toEqual(['nodes'])
    const connectionsGroup = NAV_ITEMS.filter((i) => i.group === 'connections')
    expect(connectionsGroup[connectionsGroup.length - 1].id).toBe('plugins')
    expect(
      NAV_ITEMS.some(
        (i) =>
          i.id === 'overview' ||
          i.id === 'integrations' ||
          i.id === 'downloads' ||
          i.id === 'desktop' ||
          i.id === 'game-servers' ||
          i.id === 'organize' ||
          i.id === 'paths' ||
          i.id === 'proposals',
      ),
    ).toBe(false)
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
    expect(matchNavItem(nodes, 'organize')).toBe(true)
    expect(matchNavItem(nodes, 'paths')).toBe(true)
    expect(matchNavItem(nodes, 'folders')).toBe(true)
    expect(matchNavItem(nodes, 'matching')).toBe(true)
    expect(matchNavItem(nodes, 'proposals')).toBe(true)
    expect(matchNavItem(nodes, 'xyzzy')).toBe(false)
    const launcher = NAV_ITEMS.find((i) => i.id === 'launcher')!
    expect(matchNavItem(launcher, 'xbox')).toBe(true)
    expect(matchNavItem(launcher, 'layout')).toBe(true)
    const about = NAV_ITEMS.find((i) => i.id === 'about')!
    expect(matchNavItem(about, 'about')).toBe(true)
    expect(matchNavItem(about, 'welcome')).toBe(true)
    expect(matchNavItem(about, 'documentation')).toBe(true)
    expect(matchNavItem(about, 'version')).toBe(true)
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
    rememberSettingsSection('organize')
    expect(localStorage.getItem(SETTINGS_LAST_SECTION_KEY)).toBe('nodes')
    rememberSettingsSection('paths')
    expect(localStorage.getItem(SETTINGS_LAST_SECTION_KEY)).toBe('nodes')
    rememberSettingsSection('proposals')
    expect(localStorage.getItem(SETTINGS_LAST_SECTION_KEY)).toBe('nodes')
    rememberSettingsSection('overview')
    expect(getLastSettingsSection()).toBe('nodes')
    localStorage.clear()
    expect(getLastSettingsSection()).toBe(DEFAULT_SETTINGS_SECTION)
  })
})
