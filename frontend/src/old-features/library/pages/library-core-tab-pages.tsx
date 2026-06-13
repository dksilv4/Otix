import { MediaTabContent } from "../molecules/media-tab-content"
import type { LibraryTab } from "../library-queries"

function createCoreTabPage(tab: LibraryTab) {
  return function CoreTabPage() {
    return <MediaTabContent tab={tab} />
  }
}

export const LibraryWatchlistPage = createCoreTabPage("watchlist")
export const LibraryLikePage = createCoreTabPage("like")
export const LibraryWatchedPage = createCoreTabPage("watched")
export const LibraryPlayedPage = createCoreTabPage("played")
export const LibraryListenedPage = createCoreTabPage("listened")
export const LibraryOwnedPage = createCoreTabPage("owned")
