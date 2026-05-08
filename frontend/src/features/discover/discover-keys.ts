export const discoverKeys = {
  all: () => ['discover'] as const,
  section: (mediaType: string) => [...discoverKeys.all(), 'section', mediaType] as const,
  hero: () => [...discoverKeys.all(), 'hero'] as const,
}
