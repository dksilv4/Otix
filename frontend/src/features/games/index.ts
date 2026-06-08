export {
  useGameUIState,
  useGameQueries,
  useGameShelves,
  useGameActions,
} from "./hooks/use-games"
export {
  usePopularGames,
  useGame as useGameDetail,
  useGameSuggestions,
  useGameGenres,
  popularGamesOptions,
  gameDetailOptions,
  gameKeys,
} from "./games-queries"
export type { CatalogGame, CatalogGameDetail, ShelfRow, GamesTab, LocalGame, LauncherPlatform, Game, UpdateFile, DisplayGame } from "./types"
