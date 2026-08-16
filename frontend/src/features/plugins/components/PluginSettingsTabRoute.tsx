// Resolves /settings/<tabId> to a plugin settings tab (declared in the
// plugin manifest under settings.tabs). Static settings routes win over this
// dynamic sibling; unknown ids render a benign empty state.
import { useParams } from '@tanstack/react-router'
import { usePluginTabs } from '@/features/_config/slots'
import { PluginSettingsPage } from './PluginSettingsPage'

export function PluginSettingsTabRoute() {
  const { tabId } = useParams({ from: '/settings/$tabId' })
  const { tabs, isLoading } = usePluginTabs()
  const tab = tabs.find((t) => t.id === tabId)

  if (isLoading) return null
  if (!tab) {
    return <div className="p-6 text-center text-muted-foreground text-sm">No plugin settings available</div>
  }
  return <PluginSettingsPage tab={tab} />
}
