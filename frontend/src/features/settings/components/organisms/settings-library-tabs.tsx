import { DkTabs, DkTabList, DkTab, DkTabPanel } from '@ui/molecules/tabs'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export const LIBRARY_SETTINGS_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'library', label: 'Library' },
  { id: 'paths', label: 'Paths' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'organize', label: 'Organize' },
] as const

export type LibrarySettingsTab = (typeof LIBRARY_SETTINGS_TABS)[number]['id']

/** Map hashes onto tabs. Empty / overview → Overview; legacy #games / #proposals → Library. */
export function resolveLibrarySettingsTab(hash: string | undefined | null): LibrarySettingsTab {
  const h = (hash || '').replace(/^#/, '').toLowerCase()
  if (!h || h === 'overview') return 'overview'
  if (h === 'paths') return 'paths'
  if (h === 'downloads') return 'downloads'
  if (h === 'organize') return 'organize'
  if (h === 'library' || h === 'games' || h === 'proposals') return 'library'
  return 'overview'
}

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
