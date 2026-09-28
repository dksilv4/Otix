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
  proposalsCount?: number
  className?: string
}

export function SettingsLibraryTabs({
  value,
  onValueChange,
  panels,
  proposalsCount,
  className,
}: SettingsLibraryTabsProps) {
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
            <span>{tab.label}</span>
            {tab.id === 'proposals' && proposalsCount != null && proposalsCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-primary/20 text-primary">
                {proposalsCount}
              </span>
            )}
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
