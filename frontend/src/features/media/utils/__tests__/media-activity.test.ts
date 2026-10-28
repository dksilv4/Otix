import { describe, expect, it } from 'vitest'
import {
  formatActivityBytes,
  formatActivityStatusLabel,
  formatActivityTooltip,
  resolveActivityLookupKeys,
} from '../media-activity'

describe('media-activity utils', () => {
  it('resolves correct lookup keys for movies and shows', () => {
    const movieKeys = resolveActivityLookupKeys('movie', 550, 'tmdb:movie:550')
    expect(movieKeys).toContain('tmdb:movie:550')
    expect(movieKeys).toContain('550')

    const showKeys = resolveActivityLookupKeys('show', 1399, 'tmdb:show:1399')
    expect(showKeys).toContain('tmdb:show:1399')
    expect(showKeys).toContain('1399')
  })

  it('formats activity status labels correctly', () => {
    expect(formatActivityStatusLabel('processing')).toBe('Processing Download')
    expect(formatActivityStatusLabel('requested')).toBe('Requested on Node')
    expect(formatActivityStatusLabel('available')).toBe('Available to Stream')
    expect(formatActivityStatusLabel('available', true, 8, 10)).toBe('Available (8/10 episodes)')
  })

  it('formats activity tooltips with node and friend attribution', () => {
    // Owned node
    const ownedTooltip = formatActivityTooltip('available', 'Living Room Server', 'dk', true)
    expect(ownedTooltip).toBe('Available to stream · Living Room Server')

    // Friend shared node
    const friendTooltip = formatActivityTooltip('processing', "Bob's NAS", 'Bob', false, 65)
    expect(friendTooltip).toBe("Downloading (65%) · Bob's NAS (via Bob)")

    // Requested friend node
    const requestedTooltip = formatActivityTooltip('requested', "Alice's Node", 'Alice', false)
    expect(requestedTooltip).toBe("Requested · Alice's Node (via Alice)")
  })

  it('formats activity bytes properly', () => {
    expect(formatActivityBytes(0)).toBe('0 B')
    expect(formatActivityBytes(1024)).toBe('1.0 KB')
    expect(formatActivityBytes(1048576)).toBe('1.0 MB')
    expect(formatActivityBytes(1073741824)).toBe('1.0 GB')
  })
})
