import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { openExternal, openSessionWindow } from '../open-external'

describe('openExternal', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.restoreAllMocks()
    delete (window as any).desktopAPI
    // mock window.location
    delete (window as any).location
    window.location = { ...originalLocation, href: '' } as any
    vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  afterEach(() => {
    window.location = originalLocation
  })

  it('navigates the current tab when options are omitted in web mode', () => {
    openExternal('https://example.com/oauth')
    expect(window.location.href).toBe('https://example.com/oauth')
    expect(window.open).not.toHaveBeenCalled()
  })

  it('navigates the current tab when newTab is false in web mode', () => {
    openExternal('https://example.com/oauth', { newTab: false })
    expect(window.location.href).toBe('https://example.com/oauth')
    expect(window.open).not.toHaveBeenCalled()
  })

  it('opens in a new tab when newTab is true in web mode', () => {
    openExternal('https://example.com/oauth', { newTab: true })
    expect(window.open).toHaveBeenCalledWith('https://example.com/oauth', '_blank', 'noopener,noreferrer')
    expect(window.location.href).toBe('')
  })

  it('delegates to desktopAPI.openExternal in Electron mode', () => {
    const desktopOpenExternal = vi.fn().mockResolvedValue(undefined)
    ;(window as any).desktopAPI = { openExternal: desktopOpenExternal }

    openExternal('https://example.com/epic', { newTab: true })
    expect(desktopOpenExternal).toHaveBeenCalledWith('https://example.com/epic')
    expect(window.open).not.toHaveBeenCalled()
  })

  it('falls back to window.open if desktopAPI.openExternal fails and newTab is true', async () => {
    const desktopOpenExternal = vi.fn().mockRejectedValue(new Error('IPC error'))
    ;(window as any).desktopAPI = { openExternal: desktopOpenExternal }

    openExternal('https://example.com/epic', { newTab: true })
    await Promise.resolve() // let catch run
    expect(window.open).toHaveBeenCalledWith('https://example.com/epic', '_blank', 'noopener,noreferrer')
  })
})

describe('openSessionWindow', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete (window as any).desktopAPI
    vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  it('delegates to desktopAPI.openSessionWindow in Electron', () => {
    const desktopSession = vi.fn().mockResolvedValue(undefined)
    ;(window as any).desktopAPI = { openSessionWindow: desktopSession }

    openSessionWindow('https://store.epicgames.com')
    expect(desktopSession).toHaveBeenCalledWith('https://store.epicgames.com')
  })

  it('opens in a new tab when desktopAPI is not available', () => {
    openSessionWindow('https://store.epicgames.com')
    expect(window.open).toHaveBeenCalledWith('https://store.epicgames.com', '_blank', 'noopener,noreferrer')
  })
})
