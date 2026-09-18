import { describe, expect, it } from 'vitest'
import { resolveFolderPickStrategy } from './strategy'

describe('resolveFolderPickStrategy', () => {
  it('uses the native OS dialog for local paths on desktop', () => {
    expect(
      resolveFolderPickStrategy({
        target: 'local',
        isDesktop: true,
        hasSelectDirectory: true,
        hasServers: false,
      }),
    ).toBe('native')
  })

  it('opens the node folder picker in the browser when a server is connected', () => {
    expect(
      resolveFolderPickStrategy({
        target: 'local',
        isDesktop: false,
        hasSelectDirectory: false,
        hasServers: true,
      }),
    ).toBe('server-modal')
  })

  it('opens the node folder picker for server paths even on desktop', () => {
    expect(
      resolveFolderPickStrategy({
        target: 'server',
        isDesktop: true,
        hasSelectDirectory: true,
        hasServers: true,
      }),
    ).toBe('server-modal')
  })

  it('disables browse when the browser has no connected nodes', () => {
    expect(
      resolveFolderPickStrategy({
        target: 'local',
        isDesktop: false,
        hasSelectDirectory: false,
        hasServers: false,
      }),
    ).toBe('disabled')
  })
})
