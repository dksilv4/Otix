const COLLECTION_KEYS = ['items', 'results', 'sections'] as const

/** True when a query payload is an empty list (or an infinite query of empty pages). */
export function isEmptyQueryData(data: unknown): boolean {
  if (data == null) return false
  if (Array.isArray(data)) return data.length === 0
  if (typeof data !== 'object') return false
  const record = data as Record<string, unknown>
  if (Array.isArray(record.pages)) {
    return record.pages.length === 0 || record.pages.every((page) => isEmptyQueryData(page))
  }
  const collections = COLLECTION_KEYS.filter((key) => Array.isArray(record[key]))
  if (collections.length === 0) return false
  return collections.every((key) => (record[key] as unknown[]).length === 0)
}

export function freshUnlessEmpty(freshMs: number) {
  return (query: { state: { data?: unknown; status?: string } }) => {
    if (query.state.status !== 'success') return 0
    return isEmptyQueryData(query.state.data) ? 0 : freshMs
  }
}

export function retainUnlessEmpty(retainMs: number) {
  return (query: { state: { data?: unknown; status?: string } }) => {
    if (query.state.status !== 'success') return retainMs
    return isEmptyQueryData(query.state.data) ? 0 : retainMs
  }
}
