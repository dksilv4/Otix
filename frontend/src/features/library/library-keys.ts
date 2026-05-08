export const libraryKeys = {
  all: () => ['library'] as const,
  tab: (tab: string) => [...libraryKeys.all(), tab] as const,
}
