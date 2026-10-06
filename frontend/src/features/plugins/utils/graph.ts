import type { PluginInfo } from '@/features/plugins/types/plugins'

export const NODE_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f97316', // orange
  '#ec4899', // pink
]

export const hashColor = (id: string): string => {
  const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return NODE_COLORS[hash % NODE_COLORS.length]
}

export interface GraphEdge {
  source: string
  target: string
  type: 'depends_on' | 'service' | 'same_author'
}

export interface GraphNode {
  id: string
  name: string
  status: PluginInfo['status']
  color: string
}

export const buildPluginGraph = (
  enabled: PluginInfo[],
): { nodes: GraphNode[]; edges: GraphEdge[] } => {
  const nodes: GraphNode[] = enabled.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    color: p.status === 'error' ? '#ef4444' : hashColor(p.id),
  }))

  const edges: GraphEdge[] = []
  const nodeIds = new Set(nodes.map((n) => n.id))

  // depends_on edges
  for (const plugin of enabled) {
    for (const dep of plugin.manifest.depends_on || []) {
      if (nodeIds.has(dep)) {
        edges.push({ source: plugin.id, target: dep, type: 'depends_on' })
      }
    }
  }

  // Same-author edges
  const byAuthor = new Map<string, string[]>()
  for (const plugin of enabled) {
    const author = plugin.author.toLowerCase()
    if (!byAuthor.has(author)) byAuthor.set(author, [])
    byAuthor.get(author)!.push(plugin.id)
  }
  for (const [, ids] of byAuthor) {
    if (ids.length > 1) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          edges.push({ source: ids[i], target: ids[j], type: 'same_author' })
        }
      }
    }
  }

  return { nodes, edges }
}

/** Plugins that transitively declare `pluginId` in their manifest's `depends_on`. */
export const getDependents = (pluginId: string, plugins: PluginInfo[]): PluginInfo[] => {
  const dependentsOf = new Map<string, PluginInfo[]>()
  for (const p of plugins) {
    for (const dep of p.manifest.depends_on ?? []) {
      const list = dependentsOf.get(dep) ?? []
      list.push(p)
      dependentsOf.set(dep, list)
    }
  }
  const result: PluginInfo[] = []
  const seen = new Set<string>([pluginId])
  const queue = [pluginId]
  while (queue.length) {
    const current = queue.shift()!
    for (const dependent of dependentsOf.get(current) ?? []) {
      if (seen.has(dependent.id)) continue
      seen.add(dependent.id)
      result.push(dependent)
      queue.push(dependent.id)
    }
  }
  return result
}
