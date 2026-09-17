import React from 'react'
import { DkDropdown } from '@ui/atoms/dropdown'
import { DkInput } from '@ui/atoms/input'
import type { ArrQualityProfile, ArrRootFolder } from '../arr-types'

export function ArrLibraryDefaults({
  qualityProfiles,
  rootFolders,
  qualityProfileId,
  rootFolderPath,
  onQualityProfileChange,
  onRootFolderChange,
  onRefreshProfiles,
  onRefreshFolders,
  rootPlaceholder = '/media',
  children,
}: {
  qualityProfiles: ArrQualityProfile[]
  rootFolders: ArrRootFolder[]
  qualityProfileId?: number
  rootFolderPath: string
  onQualityProfileChange: (id?: number) => void
  onRootFolderChange: (path: string) => void
  onRefreshProfiles: () => void
  onRefreshFolders: () => void
  focusClass?: string
  rootPlaceholder?: string
  children?: React.ReactNode
}) {
  const profileOptions = [
    { value: '', label: 'Default / Any' },
    ...qualityProfiles.map((qp) => ({ value: String(qp.id), label: qp.name })),
  ]
  const folderOptions = rootFolders.map((rf) => ({ value: rf.path, label: rf.path }))
  if (rootFolderPath && !folderOptions.some((option) => option.value === rootFolderPath)) {
    folderOptions.unshift({ value: rootFolderPath, label: rootFolderPath })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
        <DkDropdown
          label="Quality Profile"
          value={qualityProfileId != null ? String(qualityProfileId) : ''}
          onChange={(value) => onQualityProfileChange(value ? Number(value) : undefined)}
          options={profileOptions}
          placeholder="Default / Any"
        />
        {rootFolders.length > 0 ? (
          <DkDropdown
            label="Root Folder"
            value={rootFolderPath}
            onChange={onRootFolderChange}
            options={folderOptions}
            placeholder={rootPlaceholder}
          />
        ) : (
          <DkInput
            label="Root Folder"
            value={rootFolderPath}
            onChange={(e) => onRootFolderChange(e.target.value)}
            placeholder={rootPlaceholder}
          />
        )}
      </div>
      {children}
      <div className="flex gap-4">
        <button
          type="button"
          onClick={onRefreshProfiles}
          className="text-xs text-white/40 transition-colors hover:text-white cursor-pointer"
        >
          Refresh profiles
        </button>
        <button
          type="button"
          onClick={onRefreshFolders}
          className="text-xs text-white/40 transition-colors hover:text-white cursor-pointer"
        >
          Refresh folders
        </button>
      </div>
    </div>
  )
}
