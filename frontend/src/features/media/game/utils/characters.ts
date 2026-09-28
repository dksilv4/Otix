export interface CharacterItem {
  id: string
  character: {
    id: string
    name: string
    slug: string
    description?: string | null
    gender?: string | null
    species?: string | null
    mugShotUrl?: string | null
  }
  order: number
}

export function hasCharacterImage(item: CharacterItem): boolean {
  return Boolean(item.character?.mugShotUrl)
}

/** Characters with mugshots first; preserve order within each group. */
export function sortCharactersByImage(characters: CharacterItem[]): CharacterItem[] {
  return characters
    .map((c, index) => ({ c, index }))
    .sort((a, b) => {
      const aHas = hasCharacterImage(a.c)
      const bHas = hasCharacterImage(b.c)
      if (aHas !== bHas) return aHas ? -1 : 1
      const orderDiff = (a.c.order ?? 0) - (b.c.order ?? 0)
      if (orderDiff !== 0) return orderDiff
      return a.index - b.index
    })
    .map(({ c }) => c)
}
