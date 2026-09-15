// Resolves /settings/<tabId> to a plugin settings tab (declared in the
// plugin manifest under settings.tabs). Static settings routes win over this
// dynamic sibling; unknown ids render a benign empty state or helpful fallback.
import { useState } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { Download, DownloadCloud, Server, Puzzle, Check, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePluginTabs } from '@/features/_config/slots'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import { useServerUsenetConfig } from '@/features/downloads/use-server-usenet'
import { ServerUsenetSettingsModal } from '@/features/downloads/molecules/server-usenet-settings-modal'
import { ServerSabnzbdSettingsModal } from '@/features/downloads/molecules/server-sabnzbd-settings-modal'
import { ServerProwlarrSettingsModal } from '@/features/downloads/molecules/server-prowlarr-settings-modal'
import { PluginSettingsPage } from './PluginSettingsPage'

export function PluginSettingsTabRoute() {
  const { tabId } = useParams({ from: '/settings/$tabId' })
  const { tabs, isLoading } = usePluginTabs()
  const tab = tabs.find((t) => t.id === tabId)
  const [isUsenetModalOpen, setIsUsenetModalOpen] = useState(false)
  const [isSabnzbdModalOpen, setIsSabnzbdModalOpen] = useState(false)
  const [isProwlarrModalOpen, setIsProwlarrModalOpen] = useState(false)
  const { data: servers = [] } = useGameServers()
  const activeServer = servers[0]
  const { data: usenetConfig } = useServerUsenetConfig(activeServer?.id)
  const isSabnzbdConfigured = Boolean(
    usenetConfig?.sabnzbd?.host &&
    Boolean(usenetConfig?.sabnzbd?.api_key || usenetConfig?.sabnzbd?.configured)
  )
  const isProwlarrConfigured = Boolean(
    usenetConfig?.prowlarr?.host &&
    Boolean(usenetConfig?.prowlarr?.api_key || usenetConfig?.prowlarr?.configured)
  )

  if (isLoading) return null
  if (!tab) {
    const isDownloaderSearch = ['sabnzbd', 'prowlarr', 'usenet', 'downloads', 'nzbplanet', 'downloader'].includes(
      tabId?.toLowerCase() || ''
    )

    return (
      <div className="max-w-xl mx-auto py-16 px-6 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-primary shadow-lg">
          {isDownloaderSearch ? <DownloadCloud className="h-8 w-8" /> : <Puzzle className="h-8 w-8 text-white/40" />}
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">
            {isDownloaderSearch ? 'Usenet & Downloader Configuration' : 'No plugin settings available'}
          </h2>
          <p className="text-sm text-white/60 leading-relaxed">
            {isDownloaderSearch
              ? 'SABnzbd and Prowlarr are managed directly through your self-hosted Otix Server node instead of legacy desktop plugins.'
              : 'There are no settings available for this plugin tab. Looking for download clients or server settings?'}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {activeServer && (
            <>
              <button
                type="button"
                onClick={() => setIsSabnzbdModalOpen(true)}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all cursor-pointer',
                  isSabnzbdConfigured
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                    : 'bg-amber-500 text-black hover:opacity-90'
                )}
              >
                {isSabnzbdConfigured ? <Check className="h-4 w-4" /> : <DownloadCloud className="h-4 w-4" />}
                <span>Configure SABnzbd</span>
                {isSabnzbdConfigured && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold">
                    Connected
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsProwlarrModalOpen(true)}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all cursor-pointer',
                  isProwlarrConfigured
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                    : 'bg-rose-500 text-white hover:opacity-90'
                )}
              >
                {isProwlarrConfigured ? <Check className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                <span>Configure Prowlarr</span>
                {isProwlarrConfigured && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold">
                    Connected
                  </span>
                )}
              </button>
            </>
          )}
          <Link
            to="/downloads"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white font-medium text-sm hover:bg-white/15 transition-colors"
          >
            <Download className="h-4 w-4" />
            Downloads Queue
          </Link>
          <Link
            to="/settings/launcher"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-white/80 font-medium text-sm hover:bg-white/10 transition-colors"
          >
            <Server className="h-4 w-4" />
            Game Servers
          </Link>
        </div>

        {activeServer && (
          <>
            <ServerSabnzbdSettingsModal
              serverId={activeServer.id}
              serverName={activeServer.name}
              isOpen={isSabnzbdModalOpen}
              onClose={() => setIsSabnzbdModalOpen(false)}
            />
            <ServerProwlarrSettingsModal
              serverId={activeServer.id}
              serverName={activeServer.name}
              isOpen={isProwlarrModalOpen}
              onClose={() => setIsProwlarrModalOpen(false)}
            />
            <ServerUsenetSettingsModal
              serverId={activeServer.id}
              serverName={activeServer.name}
              isOpen={isUsenetModalOpen}
              onClose={() => setIsUsenetModalOpen(false)}
            />
          </>
        )}
      </div>
    )
  }
  return <PluginSettingsPage tab={tab} />
}
