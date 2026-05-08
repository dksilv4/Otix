export interface SearchParams {
  query: string
  type?: string
  sortBy?: string
  page?: number
}

export const mediaKeys = {
  all: () => ['media'] as const,
  detail: (id: string) => [...mediaKeys.all(), 'detail', id] as const,
  list: (type?: string) => [...mediaKeys.all(), 'list', type ?? 'all'] as const,
  search: (params: Omit<SearchParams, 'page'>) => [...mediaKeys.all(), 'search', params] as const,
  searchPoll: (params: Omit<SearchParams, 'page'> & { knownIds: string }) => [...mediaKeys.all(), 'searchPoll', params] as const,
}
