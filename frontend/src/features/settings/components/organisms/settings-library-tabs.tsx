import { DkTabs, DkTabList, DkTab, DkTabPanel } from '@ui/molecules/tabs'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import {
  LIBRARY_SETTINGS_TABS,
  type LibrarySettingsTab,
} from './settings-library-tab-utils'

export type { LibrarySettingsTab } from './settings-library-tab-utils'

export interface SettingsLibraryTabsProps {
  value: LibrarySettingsTab
  onValueChange: (tab: LibrarySettingsTab) => void
  panels: Record<LibrarySettingsTab, ReactNode>
  className?: string
}

export function SettingsLibraryTabs({ value, onValueChange, panels, className }: SettingsLibraryTabsProps) {
  return (
    <DkTabs
      defaultValue={value}
      value={value}
      onValueChange={(next) => onValueChange(next as LibrarySettingsTab)}
      className={cn('space-y-4', className)}
    >
      <DkTabList className="w-full sm:w-auto flex flex-wrap">
        {LIBRARY_SETTINGS_TABS.map((tab) => (
          <DkTab key={tab.id} value={tab.id} className="flex-1 sm:flex-none">
            {tab.label}
          </DkTab>
        ))}
      </DkTabList>

      {LIBRARY_SETTINGS_TABS.map((tab) => (
        <DkTabPanel key={tab.id} value={tab.id} className="pt-2">
          {panels[tab.id]}
        </DkTabPanel>
      ))}
    </DkTabs>
  )
}
