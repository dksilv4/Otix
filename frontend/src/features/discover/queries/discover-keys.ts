export const discoverKeys = {
  all: () => ['discover'] as const,
  list: (mediaType: string, listType: string, genre?: string, language?: string, isAnime?: boolean) =>
    [...discoverKeys.all(), 'list', mediaType, listType, genre ?? '__all', language ?? '__all', isAnime ?? '__all'] as const,
  hero: () => [...discoverKeys.all(), 'hero'] as const,
  sections: () => [...discoverKeys.all(), 'sections'] as const,
  trailers: () => [...discoverKeys.all(), 'trailers'] as const,
}
