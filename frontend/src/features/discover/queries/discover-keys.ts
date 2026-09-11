export const discoverKeys = {
  all: () => ['discover'] as const,
  list: (mediaType: string, listType: string, genre?: string, language?: string, isAnime?: boolean, platform?: string) =>
    [...discoverKeys.all(), 'list', mediaType, listType, genre ?? '__all', language ?? '__all', isAnime ?? '__all', platform ?? '__all'] as const,
  trendingSeasons: () => [...discoverKeys.all(), 'season', 'trending'] as const,
  hero: () => [...discoverKeys.all(), 'hero'] as const,
  sections: () => [...discoverKeys.all(), 'sections'] as const,
}
