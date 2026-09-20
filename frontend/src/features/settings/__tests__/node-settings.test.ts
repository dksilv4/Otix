import { describe, expect, it } from 'vitest'
import {
  nodeSettingsNavigateOptions,
  nodeSettingsPath,
  parseNodeIdParam,
  resolveNodeSettingsTab,
} from '../node-settings'

describe('node settings routes', () => {
  it('parses positive and reserved node ids from the URL', () => {
    expect(parseNodeIdParam('1')).toBe(1)
    expect(parseNodeIdParam('-1')).toBe(-1)
    expect(parseNodeIdParam('-2')).toBe(-2)
    expect(parseNodeIdParam('')).toBeNull()
    expect(parseNodeIdParam(undefined)).toBeNull()
    expect(parseNodeIdParam('abc')).toBeNull()
  })

  it('resolves tab hashes, defaulting to paths', () => {
    expect(resolveNodeSettingsTab('')).toBe('paths')
    expect(resolveNodeSettingsTab('#organize')).toBe('organize')
    expect(resolveNodeSettingsTab('downloaders')).toBe('downloaders')
    expect(resolveNodeSettingsTab('#machine')).toBe('machine')
    expect(resolveNodeSettingsTab('#nope')).toBe('paths')
  })

  it('builds node settings paths and navigate options', () => {
    expect(nodeSettingsPath(1)).toBe('/settings/nodes/1')
    expect(nodeSettingsPath(-2, 'machine')).toBe('/settings/nodes/-2#machine')
    expect(nodeSettingsPath(4, 'paths')).toBe('/settings/nodes/4')
    expect(nodeSettingsNavigateOptions(1)).toEqual({
      to: '/settings/nodes/$nodeId',
      params: { nodeId: '1' },
    })
    expect(nodeSettingsNavigateOptions(-1, 'downloaders')).toEqual({
      to: '/settings/nodes/$nodeId',
      params: { nodeId: '-1' },
      hash: 'downloaders',
    })
  })
})
