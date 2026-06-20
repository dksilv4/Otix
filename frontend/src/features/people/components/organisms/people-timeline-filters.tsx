<<<<<<<< HEAD:frontend/src/old-features/person/organisms/person-timeline-filters.tsx
// TODO: Review this file
import './person-timeline-filters.scss'
import { DkDropdown } from '@/old-features/dk-ui/atoms/dropdown'
========
import { DkDropdown } from '@ui/atoms/dropdown'
>>>>>>>> d607927de356d7641bc4391ed7e97bc43aae7dc2:frontend/src/features/people/components/organisms/people-timeline-filters.tsx

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

interface PeopleTimelineFiltersProps {
  mediaTypeFilter: string
  onMediaTypeChange: (value: string) => void
  roleFilter: string
  onRoleChange: (value: string) => void
}

export function PeopleTimelineFilters({
  mediaTypeFilter,
  onMediaTypeChange,
  roleFilter,
  onRoleChange,
}: PeopleTimelineFiltersProps) {
  return (
    <div className="flex items-center gap-2">
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
