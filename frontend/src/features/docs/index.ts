export { DocsPage } from './pages/docs-page'
export { createDocsRoutes } from './router'
export { DOCS_CATEGORIES } from './constants/docs-content'
export type {
  DocCategory,
  DocArticle,
  DocSectionId,
  DocCategoryId,
  DocSearchResult,
} from './types'
export {
  searchDocs,
  findArticleById,
  getAdjacentArticles,
  copyToClipboard,
} from './utils/docs-search'
