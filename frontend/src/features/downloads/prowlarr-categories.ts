export const PROWLARR_CATEGORY_GROUPS = [
  { id: 1000, label: 'Console' },
  { id: 2000, label: 'Movies' },
  { id: 3000, label: 'Audio' },
  { id: 4000, label: 'PC' },
  { id: 5000, label: 'TV' },
  { id: 6000, label: 'XXX' },
  { id: 7000, label: 'Books' },
  { id: 8000, label: 'Other' },
] as const

export const DEFAULT_PROWLARR_CATEGORIES = [1000, 4000]

export function categoriesFromConfig(categories?: number[]): number[] {
  if (Array.isArray(categories) && categories.length > 0) {
    return [...new Set(categories)].sort((a, b) => a - b)
  }
  return [...DEFAULT_PROWLARR_CATEGORIES]
}

export function toggleProwlarrCategory(selected: number[], id: number): number[] {
  if (selected.includes(id)) {
    return selected.filter((value) => value !== id)
  }
  return [...selected, id].sort((a, b) => a - b)
}
