import { SettingsCard } from '../../molecules/settings-card'
import { SettingsRow } from '../../molecules/settings-row'
import { SectionHeader } from '../../molecules/settings-section-header'
import { DkSwitch } from '@ui/atoms/switch'
import { useToast } from '@ui/molecules/toast'

export interface NodeOtixSidecarCardProps {
  writeOtixAfterScan: boolean
  downloadOtixImages: boolean
  setWriteOtixAfterScan: (val: boolean) => void
  setDownloadOtixImages: (val: boolean) => void
  persistOtixSettings: (next: {
    writeOtixAfterScan?: boolean
    downloadOtixImages?: boolean
  }) => Promise<void>
}

export const NodeOtixSidecarCard = ({
  writeOtixAfterScan,
  downloadOtixImages,
  setWriteOtixAfterScan,
  setDownloadOtixImages,
  persistOtixSettings,
}: NodeOtixSidecarCardProps) => {
  const { toast } = useToast()

  return (
    <SettingsCard className="space-y-3">
      <SectionHeader
        title="Otix Node Metadata Sync"
        description="Match games and save .otix sidecars and artwork directly on the remote server."
      />
      <SettingsRow
        label="Write .otix after scan"
        description="Match and hydrate games, then save an invisible .otix sidecar next to each folder."
        action={
          <DkSwitch
            checked={writeOtixAfterScan}
            onCheckedChange={async (checked) => {
              setWriteOtixAfterScan(checked)
              if (!checked) setDownloadOtixImages(false)
              try {
                await persistOtixSettings({
                  writeOtixAfterScan: checked,
                  downloadOtixImages: checked ? downloadOtixImages : false,
                })
              } catch (err) {
                console.error('Failed to save otix settings:', err)
                toast({
                  title: 'Could not save setting',
                  description: 'Otix Node may be offline or needs an update.',
                  variant: 'error',
                })
              }
            }}
          />
        }
      />
      <SettingsRow
        label="Download images locally"
        description="Save poster/backdrop/logo as .otix-*.jpg next to each game and reference them in the sidecar."
        action={
          <DkSwitch
            checked={downloadOtixImages}
            disabled={!writeOtixAfterScan}
            onCheckedChange={async (checked) => {
              setDownloadOtixImages(checked)
              try {
                await persistOtixSettings({ downloadOtixImages: checked })
              } catch (err) {
                console.error('Failed to save otix settings:', err)
                toast({
                  title: 'Could not save setting',
                  description: 'Otix Node may be offline or needs an update.',
                  variant: 'error',
                })
              }
            }}
          />
        }
      />
    </SettingsCard>
  )
}
