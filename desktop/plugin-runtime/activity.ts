// desktop/plugins/activity.ts
// Framework-side activity store. Plugins publish activity items via ctx.activity;
// the renderer reads the aggregated store through the plugin:get-activity IPC.

import type { PluginActivityItem } from './types'

// Prune stale completed/error items on read so the panel doesn't accumulate a
// permanent history. Active items stay until the plugin updates or clears them.
const COMPLETED_MAX_AGE_MS = 15 * 60 * 1000

const store = new Map<string, PluginActivityItem[]>()

function withTimestamp(item: PluginActivityItem): PluginActivityItem {
  if (item.timestamp) return item
  return { ...item, timestamp: Date.now() }
}

function prune(items: PluginActivityItem[]): PluginActivityItem[] {
  const now = Date.now()
  return items.filter((item) => {
    if (item.status === 'active') return true
    const ts = item.timestamp || 0
    return !ts || now - ts < COMPLETED_MAX_AGE_MS
  })
}

export function publishActivity(pluginId: string, item: PluginActivityItem): void {
  const next = withTimestamp(item)
  const items = store.get(pluginId) || []
  const idx = items.findIndex((i) => i.id === next.id)
  if (idx >= 0) items[idx] = next
  else items.push(next)
  store.set(pluginId, items)
}

export function removeActivity(pluginId: string, id: string): void {
  const items = store.get(pluginId)
  if (!items) return
  store.set(pluginId, items.filter((i) => i.id !== id))
}

export function clearActivity(pluginId: string): void {
  store.delete(pluginId)
}

export function getPluginActivity(pluginId: string): PluginActivityItem[] {
  return prune(store.get(pluginId) || [])
}

export function getAllActivity(): Array<{ pluginId: string; activities: PluginActivityItem[] }> {
  const entries: Array<{ pluginId: string; activities: PluginActivityItem[] }> = []
  for (const [pluginId, items] of store.entries()) {
    const pruned = prune(items)
    if (pruned.length) entries.push({ pluginId, activities: pruned })
  }
  return entries
}
