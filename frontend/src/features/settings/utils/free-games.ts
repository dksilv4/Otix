export const EPIC_FREE_PAGE = 'https://store.epicgames.com/free-games'

export interface EpicFreeGameRef {
  urlSlug?: string | null
}

export const claimUrl = (game: EpicFreeGameRef): string => {
  // offerId is NOT a valid product-page slug — only urlSlug navigates to the
  // game. Without one, drop to the free-games page where it can be claimed.
  return game.urlSlug ? `https://store.epicgames.com/p/${game.urlSlug}` : EPIC_FREE_PAGE
}
