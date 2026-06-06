// TODO: Review this file
export interface SearchParams {
  query: string
  type?: string
  sortBy?: string
  page?: number
}

export interface ListParams {
  type?: string
  genre?: string
  company?: string
  certification?: string
  sortBy?: string
  page?: number
  limit?: number
}

export const mediaKeys = {
  all: () => ['media'] as const,
  detail: (id: string) => [...mediaKeys.all(), 'detail', id] as const,
  list: (type?: string, opts?: Omit<ListParams, 'type'>) =>
    [...mediaKeys.all(), 'list', type ?? 'all', opts] as const,
  infiniteList: (type?: string, opts?: Omit<ListParams, 'type'>) =>
    [...mediaKeys.all(), 'infiniteList', type ?? 'all', opts] as const,
  search: (params: Omit<SearchParams, 'page'>) => [...mediaKeys.all(), 'search', params] as const,
  searchPoll: (params: Omit<SearchParams, 'page'> & { knownIds: string }) => [...mediaKeys.all(), 'searchPoll', params] as const,
  similar: (id: string, mediaType?: string) => [...mediaKeys.all(), 'similar', id, mediaType ?? 'all'] as const,
  recommendations: (id: string) => [...mediaKeys.all(), 'recommendations', id] as const,
}
