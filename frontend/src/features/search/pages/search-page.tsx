import { lazy, useState, useEffect, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { useSearch, useNavigate, Outlet } from '@tanstack/react-router'
import { SearchInput } from '@search/components/molecules/search-chat-input'
import { SearchResults } from '@search/components/organisms/search-results'
import { SearchSortBar } from '@search/components/molecules/search-sort-bar'
import type { SortValue, TypeValue } from '@search/types'

const AnimatedShaderBackground = lazy(() => import('@/components/animated-shader-background'))

export const SearchPage = () => {
  const search = useSearch({ from: '/search' })
  const navigate = useNavigate({ from: '/search' })

  const urlQ = search?.q ?? ''
  const urlType = (search?.type ?? 'all') as TypeValue
  const urlSort = (search?.sort ?? '') as SortValue

  // Local input state for responsive typing
  const [inputValue, setInputValue] = useState(urlQ)

  // Sync URL → local state when URL changes externally (back/forward nav)
  const prevUrlQRef = useRef(urlQ)
  useEffect(() => {
    if (prevUrlQRef.current !== urlQ) {
      prevUrlQRef.current = urlQ
      setInputValue(urlQ)
    }
  }, [urlQ])

  // Navigation helper
  const updateUrl = (q: string) => {
    void navigate({
      search: {
        q: q || undefined,
        type: urlType !== 'all' ? urlType : undefined,
        sort: urlSort || undefined,
      },
      replace: true,
    })
  }

  // SearchInput fires onChange after its internal debounce settles
  const handleInputChange = (val: string) => {
    setInputValue(val)
    updateUrl(val)
  }

  // Immediate URL update on Enter / arrow click
  const handleSubmit = () => {
    if (inputValue) updateUrl(inputValue)
  }

  const handleTypeChange = (type: TypeValue) => {
    void navigate({
      search: {
        q: urlQ || undefined,
        type: type !== 'all' ? type : undefined,
        sort: urlSort || undefined,
      },
      replace: true,
    })
  }

  const handleSortChange = (sort: SortValue) => {
    void navigate({
      search: {
        q: urlQ || undefined,
        type: urlType !== 'all' ? urlType : undefined,
        sort: sort || undefined,
      },
      replace: true,
    })
  }

  const hasSearch = !!urlQ

  return (
    <div
      id="search-page"
      className="relative flex flex-col"
      style={{ minHeight: 'calc(100vh - 5rem)' }}
    >
      <Helmet>
        <title>Search - Otix</title>
        <meta
          name="description"
          content="Search movies, shows, and games on Otix."
        />
      </Helmet>

      <AnimatedShaderBackground mode="idle" />

      <div className="relative z-10 mx-auto flex w-full flex-1 flex-col">
        {/* Push input to center when empty */}
        {!hasSearch && <div className="flex-1" />}

        {/* Search input */}
        <div className={'w-full px-4' + (hasSearch ? ' pt-6' : '')}>
          <div className={'mx-auto' + (hasSearch ? ' max-w-[700px]' : ' w-full max-w-[600px]')}>
            <SearchInput
              value={inputValue}
              onChange={handleInputChange}
              onSubmit={handleSubmit}
              placeholder="Search movies, shows, games..."
            />
          </div>
        </div>

        {hasSearch ? (
          <>
            {/* Type / sort filters */}
            <div className="mx-auto w-full max-w-[700px] px-4">
              <SearchSortBar
                type={urlType}
                sort={urlSort}
                onTypeChange={handleTypeChange}
                onSortChange={handleSortChange}
                className="mt-4"
              />
            </div>

            {/* Search results */}
            <div className="mt-6 flex-1">
              <SearchResults
                query={urlQ}
                type={urlType}
                sort={urlSort}
              />
            </div>
          </>
        ) : (
          /* Push input to center when empty */
          <div className="flex-1" />
        )}
      </div>
      <Outlet />
    </div>
  )
};
