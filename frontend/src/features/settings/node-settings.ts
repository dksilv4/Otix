export type NodeSettingsTab = 'paths' | 'organize' | 'downloaders' | 'machine'

export const NODE_SETTINGS_TABS: { id: NodeSettingsTab; label: string }[] = [
  { id: 'paths', label: 'Paths' },
  { id: 'organize', label: 'Organize' },
  { id: 'downloaders', label: 'Downloaders' },
  { id: 'machine', label: 'Machine' },
]

export function parseNodeIdParam(raw: string | undefined | null): number | null {
  if (raw == null || raw === '') return null
  const id = Number(raw)
  return Number.isFinite(id) ? id : null
}

export function resolveNodeSettingsTab(hash: string | undefined | null): NodeSettingsTab {
  const h = (hash || '').replace(/^#/, '').toLowerCase()
  if (h === 'organize' || h === 'downloaders' || h === 'machine' || h === 'paths') return h
  return 'paths'
}

export function nodeSettingsPath(nodeId: number, tab?: NodeSettingsTab): string {
  const base = `/settings/nodes/${nodeId}`
  return tab && tab !== 'paths' ? `${base}#${tab}` : base
}

export function nodeSettingsNavigateOptions(nodeId: number, tab?: NodeSettingsTab) {
  return {
    to: '/settings/nodes/$nodeId' as const,
    params: { nodeId: String(nodeId) },
    ...(tab && tab !== 'paths' ? { hash: tab } : {}),
  }
}
