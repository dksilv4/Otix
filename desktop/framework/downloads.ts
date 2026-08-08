// desktop/framework/downloads.ts
// Centralized download data layer — the single source of truth for download
// queue/history/config/path-mapping/wishlist state. Lives in the framework,
// not in a plugin, so it is always available regardless of plugin lifecycle.
//
// Used by:
//   - the downloads plugin (mutate ops via the `downloads.*` SDK methods)
//   - IPC handlers in ipc/downloads.ts (renderer queries)
//   - any plugin granted `table:downloads` that wants to read download state
//
// This replaces the `downloadsDb.*` raw-SQL backdoor. No plugin should ever
// run arbitrary SQL against the main database.

export {
  getConfig,
  saveConfig,
  getDownload,
  getUserDownloads,
  createDownload,
  updateDownloadStatus,
  updateDownloadIsoPath,
  deleteDownload,
  purgeOldDeletedDownloads,
  getPathMappings,
  addPathMapping,
  removePathMapping,
  recordWishlistSearch,
  getWishlistTracking,
  skipWishlistItem,
} from '../downloads/index'

export type { Download, DownloadConfig, PathMapping } from '../downloads/index'
