// desktop/plugins/slots.ts

interface SlotEntry {
  pluginId: string
  label: string
}

export class SlotRegistry {
  private slots: Map<string, SlotEntry[]> = new Map()
  private failures: Map<string, Map<string, number>> = new Map()
  private suspended: Map<string, Set<string>> = new Map()

  register(pluginId: string, location: string, label: string): void {
    const existing = this.slots.get(location) || []
    if (!existing.some(e => e.pluginId === pluginId)) {
      existing.push({ pluginId, label })
      this.slots.set(location, existing)
    }
  }

  unregister(pluginId: string, location: string): void {
    const existing = this.slots.get(location) || []
    this.slots.set(location, existing.filter(e => e.pluginId !== pluginId))
  }

  unregisterAll(pluginId: string): void {
    for (const [location, entries] of this.slots.entries()) {
      this.slots.set(location, entries.filter(e => e.pluginId !== pluginId))
    }
    this.failures.delete(pluginId)
    this.suspended.delete(pluginId)
  }

  getPluginsForSlot(location: string): SlotEntry[] {
    return this.slots.get(location) || []
  }

  // ── Failure tracking ──
  recordFailure(pluginId: string, location: string): void {
    if (!this.failures.has(pluginId)) {
      this.failures.set(pluginId, new Map())
    }
    const pluginFailures = this.failures.get(pluginId)!
    pluginFailures.set(location, (pluginFailures.get(location) || 0) + 1)
  }

  getFailures(pluginId: string, location: string): number {
    return this.failures.get(pluginId)?.get(location) || 0
  }

  resetFailures(pluginId: string, location: string): void {
    const pluginFailures = this.failures.get(pluginId)
    if (pluginFailures) {
      pluginFailures.delete(location)
    }
  }

  // ── Suspension ──
  suspend(pluginId: string, location: string): void {
    if (!this.suspended.has(pluginId)) {
      this.suspended.set(pluginId, new Set())
    }
    this.suspended.get(pluginId)!.add(location)
  }

  unsuspend(pluginId: string, location: string): void {
    this.suspended.get(pluginId)?.delete(location)
    this.resetFailures(pluginId, location)
  }

  isSuspended(pluginId: string, location: string): boolean {
    return this.suspended.get(pluginId)?.has(location) || false
  }

  getSuspendedSlots(pluginId: string): string[] {
    return [...(this.suspended.get(pluginId) || [])]
  }
}
