import { Server } from 'lucide-react'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { useSettingsHashScroll } from '../hooks/use-settings-hash-scroll'
import { SettingsDownloadsPage } from './settings-downloads-page'

export function SettingsNodesPage() {
  useSettingsHashScroll()

  return (
    <div id="settings-desktop-section" className="space-y-8">
      <SectionHeader
        variant="page"
        icon={Server}
        title="Nodes"
        description="Select a node to open its page for folders, organize, downloaders, and machine options. Connect workers to host your library from anywhere."
      />

      <SettingsDownloadsPage embedded variant="nodes" />
    </div>
  )
}

export { SettingsNodesPage as SettingsDesktopPage }
