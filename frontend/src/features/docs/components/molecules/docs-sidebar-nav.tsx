import type { DocCategory, DocSectionId, DocSearchResult } from '../../types'
import { DocsSearchInput } from '../atoms/docs-search-input'
import { ChevronRight, FileText } from 'lucide-react'

interface DocsSidebarNavProps {
  categories: DocCategory[]
  activeSectionId: DocSectionId
  searchQuery: string
  searchResults: DocSearchResult[]
  onSearchChange: (query: string) => void
  onSelectSection: (sectionId: DocSectionId) => void
}

export const DocsSidebarNav = ({
  categories,
  activeSectionId,
  searchQuery,
  searchResults,
  onSearchChange,
  onSelectSection,
}: DocsSidebarNavProps) => {
  return (
    <nav
      aria-label="Documentation navigation"
      className="flex flex-col gap-4 w-full h-full text-xs sm:text-sm"
    >
      <div className="px-1">
        <DocsSearchInput
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Filter documentation..."
        />
      </div>

      {searchQuery.trim() ? (
        <div className="space-y-1.5 overflow-y-auto px-1 flex-1">
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Search Results ({searchResults.length})
          </div>
          {searchResults.length === 0 ? (
            <div className="p-4 rounded-xl text-center text-xs text-muted-foreground bg-[var(--dk-surface-ghost)]">
              No matching documentation articles found.
            </div>
          ) : (
            searchResults.map((result) => {
              const isActive = activeSectionId === result.article.id
              return (
                <button
                  key={`search-res-${result.article.id}`}
                  type="button"
                  onClick={() => onSelectSection(result.article.id)}
                  className={`w-full text-left p-2.5 rounded-xl transition-all duration-150 flex flex-col gap-1 ${
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-[var(--dk-surface-ghost-hover)]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span>{result.article.title}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground line-clamp-1">
                    {result.matchedSnippet}
                  </span>
                </button>
              )
            })
          )}
        </div>
      ) : (
        <div className="space-y-6 overflow-y-auto px-1 flex-1 pr-2">
          {categories.map((category) => {
            const Icon = category.icon
            return (
              <div key={category.id} className="space-y-1">
                <div className="flex items-center gap-2 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
                  <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">{category.title}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {category.articles.map((article) => {
                    const isActive = activeSectionId === article.id
                    return (
                      <button
                        key={article.id}
                        type="button"
                        onClick={() => onSelectSection(article.id)}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs sm:text-sm transition-all duration-150 ${
                          isActive
                            ? 'bg-primary/10 text-primary font-semibold shadow-xs'
                            : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]'
                        }`}
                      >
                        <span className="truncate">{article.shortTitle || article.title}</span>
                        {isActive && <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </nav>
  )
}
