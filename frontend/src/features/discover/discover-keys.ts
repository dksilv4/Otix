export const discoverKeys = {
  all: () => ['discover'] as const,
  list: (mediaType: string, listType: string) => [...discoverKeys.all(), 'list', mediaType, listType] as const,
  hero: () => [...discoverKeys.all(), 'hero'] as const,
}
