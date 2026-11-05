import { DkDropdown } from '@ui/atoms/dropdown'
import { Download } from 'lucide-react'
import type { SortValue, TypeValue } from '@search/types'
import { SORT_OPTIONS, TYPE_OPTIONS } from '../../utils/search-helpers'
import { openIndexerSearch } from '@/features/downloads/open-indexer-search'

export { SORT_OPTIONS, TYPE_OPTIONS }

interface SearchSortBarProps {
  type: TypeValue
  sort: SortValue
  total?: number
  query?: string
  onTypeChange: (type: TypeValue) => void
  onSortChange: (sort: SortValue) => void
  className?: string
}

export const SearchSortBar = ({
  type,
  sort,
  total,
  query,
  onTypeChange,
  onSortChange,
  className = '',
}: SearchSortBarProps) => {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
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

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => openIndexerSearch({ query })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-muted-foreground hover:text-foreground border border-white/[0.04] transition-colors"
          title="Search configured indexers"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Indexers</span>
        </button>

        {total !== undefined && (
          <span className="text-sm text-muted-foreground/50">
            {total.toLocaleString()} results
          </span>
        )}
      </div>
    </div>
  )
}
