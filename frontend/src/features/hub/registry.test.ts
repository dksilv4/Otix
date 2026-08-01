import { describe, it, expect, beforeEach, vi } from 'vitest'
import { clearHubProviders, getHubProviders, registerHubProvider } from './registry'
import { createNavigationProvider } from './providers/navigation-provider'
import { createMediaProvider } from './providers/media-provider'
import type { CommandProvider } from './types'

describe('hub registry', () => {
  beforeEach(() => clearHubProviders())

  it('registers and returns providers', () => {
    const provider: CommandProvider = {
      id: 'test',
      label: 'Test',
      domain: 'system',
      search: () => [],
    }
    registerHubProvider(provider)
    expect(getHubProviders()).toEqual([provider])
  })

  it('unregister removes the provider', () => {
    const unregister = registerHubProvider({
      id: 'test',
      label: 'Test',
      domain: 'system',
      search: () => [],
    })
    unregister()
    expect(getHubProviders()).toHaveLength(0)
  })

  it('overwrites a provider with the same id', () => {
    registerHubProvider({ id: 'x', label: 'A', domain: 'system', search: () => [] })
    registerHubProvider({ id: 'x', label: 'B', domain: 'system', search: () => [] })
    expect(getHubProviders()).toHaveLength(1)
    expect(getHubProviders()[0].label).toBe('B')
  })
})

describe('navigation provider', () => {
  it('returns all destinations on empty query', async () => {
    const commands = await createNavigationProvider().search('')
    expect(commands.length).toBeGreaterThan(3)
    expect(commands.some((c) => c.title === 'Discover')).toBe(true)
  })

  it('filters by query and keywords', async () => {
    const provider = createNavigationProvider()
    expect(await provider.search('calendar')).toHaveLength(1)
    // matches via keyword
    expect((await provider.search('releases')).map((c) => c.title)).toContain('Calendar')
  })

  it('produces runnable navigation commands', async () => {
    const commands = await createNavigationProvider().search('discover')
    expect(commands).toHaveLength(1)
    const cmd = commands[0]
    expect(cmd.id).toBe('nav:discover')
    expect(typeof cmd.run).toBe('function')
  })
})

describe('media provider', () => {
  it('returns empty for empty query without calling the API', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const commands = await createMediaProvider().search('')
    expect(commands).toEqual([])
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
