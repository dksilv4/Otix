// TODO: Review this file
import { DkDropdown } from '@/features/dk-ui/atoms/dropdown'
import { cn } from '@/lib/utils'
import './search-sort-bar.scss'

export const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'movie', label: 'Movies' },
  { value: 'show', label: 'Shows' },
  { value: 'game', label: 'Games' },
  { value: 'music', label: 'Music' },
  { value: 'people', label: 'Artists' },
  { value: 'users', label: 'Users' },
] as const

export const SORT_OPTIONS = [
  { value: '', label: 'Relevance' },
  { value: 'popularity', label: 'Popular' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'release_date', label: 'Newest' },
  { value: 'title', label: 'A–Z' },
  { value: 'revenue', label: 'Highest Revenue' },
  { value: 'budget', label: 'Highest Budget' },
  { value: 'profit', label: 'Most Profitable' },
] as const

export type TypeValue = (typeof TYPE_OPTIONS)[number]['value']
export type SortValue = (typeof SORT_OPTIONS)[number]['value']

interface SearchSortBarProps {
  typeValue: TypeValue
  onTypeChange: (value: TypeValue) => void
  sortValue: SortValue
  onSortChange: (value: SortValue) => void
  resultCount?: number
  className?: string
}

export function SearchSortBar({
  typeValue,
  onTypeChange,
  sortValue,
  onSortChange,
  resultCount,
  className,
}: SearchSortBarProps) {
  return (
    <div className={cn('dk-discover-search-sort-bar', className)}>
      <div className="dk-discover-search-sort-bar__filters">
        <DkDropdown variant="filter" label="Type" options={TYPE_OPTIONS} value={typeValue} onChange={onTypeChange} />
        <DkDropdown variant="filter" label="Sort" options={SORT_OPTIONS} value={sortValue} onChange={onSortChange} />
      </div>
      {resultCount !== undefined && (
        <span className="dk-discover-search-sort-bar__count">
          {resultCount.toLocaleString()} result{resultCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}
