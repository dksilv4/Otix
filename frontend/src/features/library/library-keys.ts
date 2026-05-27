export const libraryKeys = {
  all: () => ['library'] as const,
  tab: (tab: string, extra?: Record<string, string>) => [...libraryKeys.all(), tab, extra] as const,
}
