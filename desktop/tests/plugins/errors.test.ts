import { describe, it, expect } from 'vitest'
import {
  PluginError, PluginNotFoundError, SlotError, SlotRenderError, SlotSuspendedError,
  PermissionError, PermissionDeniedError, DatabaseError, MigrationError,
} from '../../plugins/errors'

describe('Error hierarchy', () => {
  it('PluginNotFoundError is instanceof PluginError', () => {
    const err = new PluginNotFoundError('test-plugin')
    expect(err).toBeInstanceOf(PluginError)
    expect(err).toBeInstanceOf(Error)
    expect(err.pluginId).toBe('test-plugin')
  })

  it('SlotRenderError is instanceof SlotError', () => {
    const err = new SlotRenderError('settings/library', 'epic', 'timeout')
    expect(err).toBeInstanceOf(SlotError)
    expect(err).toBeInstanceOf(Error)
    expect(err.location).toBe('settings/library')
    expect(err.pluginId).toBe('epic')
  })

  it('SlotSuspendedError carries location and pluginId', () => {
    const err = new SlotSuspendedError('settings/matching', 'bad-plugin')
    expect(err).toBeInstanceOf(SlotError)
    expect(err.location).toBe('settings/matching')
    expect(err.pluginId).toBe('bad-plugin')
  })

  it('PermissionDeniedError is instanceof PermissionError', () => {
    const err = new PermissionDeniedError('p1', 'network:external')
    expect(err).toBeInstanceOf(PermissionError)
  })

  it('MigrationError is instanceof DatabaseError', () => {
    const err = new MigrationError('downloads', 5, 'column missing')
    expect(err).toBeInstanceOf(DatabaseError)
  })
})
