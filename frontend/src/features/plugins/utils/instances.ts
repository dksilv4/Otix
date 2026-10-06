import type { PluginConfigField } from '@/features/plugins/types/plugins'

export type InstanceRecord = Record<string, unknown>

export const URL_PARTS = ['host', 'port', 'useSsl', 'baseUrl'] as const
export type UrlParts = (typeof URL_PARTS)[number]

export const parseServerUrl = (raw: string): Pick<InstanceRecord, UrlParts> | null => {
  const input = raw.trim()
  if (!input) return null
  let u: URL
  try {
    u = new URL(input.includes('://') ? input : `http://${input}`)
  } catch {
    return null
  }
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : undefined,
    useSsl: u.protocol === 'https:',
    baseUrl: u.pathname.replace(/\/+$/, ''),
  }
}

export const composeUrl = (inst: InstanceRecord): string => {
  const host = inst.host as string
  if (!host) return ''
  const scheme = inst.useSsl ? 'https' : 'http'
  const port = inst.port ? `:${inst.port}` : ''
  return `${scheme}://${host}${port}${(inst.baseUrl as string) || ''}`
}

export const instanceSummary = (items: Record<string, PluginConfigField>, inst: InstanceRecord): string => {
  const urlKey = Object.keys(items).find((k) => items[k].type === 'serverUrl')
  if (urlKey) {
    const composed = composeUrl(inst)
    if (composed) return composed
  }
  const parts = Object.keys(items).filter(
    (k) => items[k].type !== 'serverUrl' && items[k].type !== 'secret' && inst[k] != null && inst[k] !== '',
  )
  const joined = parts.map((k) => String(inst[k])).join(' · ')
  return joined || (inst.id as string) || 'Unnamed'
}

export const parseParts = (raw: string, parts: string[]): Partial<Record<UrlParts, unknown>> | null => {
  const parsed = parseServerUrl(raw)
  if (!parsed) return null
  const out: Partial<Record<UrlParts, unknown>> = {}
  for (const part of parts) {
    if ((URL_PARTS as readonly string[]).includes(part)) out[part as UrlParts] = parsed[part as UrlParts]
  }
  return out
}
