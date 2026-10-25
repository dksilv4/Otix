import { Search } from 'lucide-react'
import { DkSwitch } from '@ui/atoms/switch'
import { SectionHeader } from '../molecules/settings-section-header'
import { SettingsCard } from '../molecules/settings-card'
import { SettingsRow } from '../molecules/settings-row'

export interface OrganizeAutomationCardProps {
  autoSearch: boolean
  intervalHours: number
  postProcessEnabled: boolean
  scanOnLaunch: boolean
  deleteEmptyFolders?: boolean
  onSetAutoSearch: (enabled: boolean) => void
  onSetIntervalHours: (hours: number) => void
  onSetPostProcessEnabled: (enabled: boolean) => void
  onSetScanOnLaunch: (enabled: boolean) => void
  onSetDeleteEmptyFolders?: (enabled: boolean) => void
}

export const OrganizeAutomationCard = ({
  autoSearch,
  intervalHours,
  postProcessEnabled,
  scanOnLaunch,
  deleteEmptyFolders = true,
  onSetAutoSearch,
  onSetIntervalHours,
  onSetPostProcessEnabled,
  onSetScanOnLaunch,
  onSetDeleteEmptyFolders,
}: OrganizeAutomationCardProps) => {
  return (
    <SettingsCard className="space-y-3">
      <SectionHeader
        title="Automation"
        description="Wishlist scanning, post-processing, and library refresh."
      />
      <SettingsRow
        icon={<Search className="h-4 w-4" />}
        label="Auto-search wishlist"
        description={`Scan wishlist every ${intervalHours}h for new releases.`}
        action={
          <div className="flex items-center gap-2">
            {autoSearch && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={intervalHours}
                  onChange={(e) => onSetIntervalHours(parseInt(e.target.value, 10) || 12)}
                  min={1}
                  max={168}
                  aria-label="Wishlist interval hours"
                  className="h-7 w-14 rounded-lg px-2 text-xs font-mono outline-none text-foreground bg-white/[0.04] border border-white/[0.06] focus:ring-1 focus:ring-primary/40 text-center"
                />
                <span className="text-[11px] text-muted-foreground">h</span>
              </div>
            )}
            <DkSwitch checked={autoSearch} onCheckedChange={onSetAutoSearch} />
          </div>
        }
      />
      <SettingsRow
        label="Post-process after download"
        description="Extract, verify, and move completed downloads into your library paths."
        action={<DkSwitch checked={postProcessEnabled} onCheckedChange={onSetPostProcessEnabled} />}
      />
      <SettingsRow
        label="Scan library on launch"
        description="Rescan configured folders when the selected node starts."
        action={<DkSwitch checked={scanOnLaunch} onCheckedChange={onSetScanOnLaunch} />}
      />
      {onSetDeleteEmptyFolders && (
        <SettingsRow
          label="Delete empty folders"
          description="Automatically remove directories left empty after moving organized games."
          action={<DkSwitch checked={deleteEmptyFolders} onCheckedChange={onSetDeleteEmptyFolders} />}
        />
      )}
    </SettingsCard>
  )
}
