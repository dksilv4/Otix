// TODO: Review this file
import './person-timeline-filters.scss'
import { DkDropdown } from '@/old-features/dk-ui/atoms/dropdown'

const MEDIA_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'movie', label: 'Movies' },
  { value: 'show', label: 'Shows' },
  { value: 'game', label: 'Games' },
  { value: 'music', label: 'Music' },
]

const ROLE_OPTIONS = [
  { value: 'all', label: 'All Roles' },
  { value: 'cast', label: 'Actor' },
  { value: 'director', label: 'Director' },
  { value: 'producer', label: 'Producer' },
  { value: 'writer', label: 'Writer' },
  { value: 'composer', label: 'Composer' },
  { value: 'crew', label: 'Crew' },
]

interface PersonTimelineFiltersProps {
  mediaTypeFilter: string
  onMediaTypeChange: (value: string) => void
  roleFilter: string
  onRoleChange: (value: string) => void
}

export function PersonTimelineFilters({
  mediaTypeFilter,
  onMediaTypeChange,
  roleFilter,
  onRoleChange,
}: PersonTimelineFiltersProps) {
  return (
    <div className="dk-person-timeline-filters">
      <DkDropdown
        variant="filter"
        label="Type"
        options={MEDIA_TYPE_OPTIONS}
        value={mediaTypeFilter === 'all' ? '' : mediaTypeFilter}
        onChange={(v) => onMediaTypeChange(v || 'all')}
      />
      <DkDropdown
        variant="filter"
        label="Role"
        options={ROLE_OPTIONS}
        value={roleFilter === 'all' ? '' : roleFilter}
        onChange={(v) => onRoleChange(v || 'all')}
      />
    </div>
  )
}
