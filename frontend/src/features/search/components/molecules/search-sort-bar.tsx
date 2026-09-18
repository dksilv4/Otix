import { DkDropdown } from '@ui/atoms/dropdown'
import type { SortValue, TypeValue } from '@search/types'

export const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'rating', label: 'Rating' },
  { value: 'popularity', label: 'Popularity' },
  { value: 'year', label: 'Year' },
  { value: 'title', label: 'Title' },
  { value: 'recent', label: 'Recent' },
]

export const TYPE_OPTIONS: { value: TypeValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'show', label: 'Shows' },
  { value: 'game', label: 'Games' },
  { value: 'person', label: 'People' },
  { value: 'user', label: 'Users' },
]

interface SearchSortBarProps {
  type: TypeValue
  sort: SortValue
  total?: number
  onTypeChange: (type: TypeValue) => void
  onSortChange: (sort: SortValue) => void
  className?: string
}

export function SearchSortBar({
  type,
  sort,
  total,
  onTypeChange,
  onSortChange,
  className,
}: SearchSortBarProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-2">
        <DkDropdown
          value={type}
          options={TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => onTypeChange(v as TypeValue)}
        />
        <DkDropdown
          value={sort}
          options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => onSortChange(v as SortValue)}
        />
      </div>
      {total != null && (
        <span className="text-sm text-muted-foreground">{total} results</span>
      )}
    </div>
  )
}
