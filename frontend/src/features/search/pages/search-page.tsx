import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useSearch } from '@tanstack/react-router'
import { SearchInput } from '@search/components/molecules/chat-search-input'
import { SearchResults } from '@search/components/organisms/search-results'
import { SearchSortBar } from '@search/components/molecules/search-sort-bar'
import type { SortValue, TypeValue } from '@search/types'
import { useDebouncedInput } from '@search/hooks/use-debounced-input'

export function SearchPage() {
  const search = useSearch({ from: '/search' }) as Record<string, unknown>
  const urlQ = (search.q as string) || ''
  const urlType = (search.type as string) || 'all'
  const urlSort = (search.sort as string) || ''

  // Search filter state
  const [searchType, setSearchType] = useState<TypeValue>(urlType as TypeValue)
  const [searchSort, setSearchSort] = useState<SortValue>((urlSort as SortValue) || 'relevance')
  const [inputValue, setInputValue] = useState(urlQ)

  // Debounced search input for the SearchResults component
  const debounced = useDebouncedInput(inputValue, () => {}, 300)

  // The active search query: prefer the debounced input value when available,
  // falling back to the URL query parameter.
  const activeQuery = debounced.displayValue || urlQ || ''

  return (
    <div
      className="relative flex flex-col"
      style={{ minHeight: 'calc(100vh - 5rem)' }}
    >
      <Helmet>
        <title>Search - Otix</title>
        <meta
          name="description"
          content="Search movies, shows, games, and music on Otix."
        />
      </Helmet>

      <div className="mx-auto flex w-full max-w-[800px] flex-col px-4 pt-6">
        {/* Search input */}
        <SearchInput
          value={inputValue}
          onChange={setInputValue}
          placeholder="Search movies, shows, games, music..."
        />

        {/* Type / sort filters */}
        <SearchSortBar
          type={searchType}
          sort={searchSort}
          onTypeChange={setSearchType}
          onSortChange={setSearchSort}
          className="mt-4"
        />

        {/* Search results */}
        <div className="mt-6 flex-1">
          <SearchResults
            query={activeQuery}
            type={searchType}
            sort={searchSort}
          />
        </div>
      </div>
    </div>
  )
}
