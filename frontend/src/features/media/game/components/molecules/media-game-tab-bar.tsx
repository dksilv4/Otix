import { useState, useEffect } from 'react'

interface GameTab {
  tabId: string
  label: string
  pluginId: string
}

interface Props {
  gameExternalId: string
  activeTab: string
  onTabChange: (tabId: string) => void
  onTabsLoaded?: (tabs: Array<{tabId: string; pluginId: string}>) => void
}

export function GameTabBar({ gameExternalId, activeTab, onTabChange, onTabsLoaded }: Props) {
  const [pluginTabs, setPluginTabs] = useState<GameTab[]>([])
  const [loading, setLoading] = useState(true)
  const desktopAPI = (window as any).desktopAPI

  useEffect(() => {
    let cancelled = false
    async function loadTabs() {
      if (!desktopAPI?.plugin?.getSlotData) {
        setLoading(false)
        return
      }
      try {
        const slotData = await desktopAPI.plugin.getSlotData('media/game/detail/tabs', {
          externalIds: [gameExternalId],
        })
        if (!cancelled && slotData?.length) {
          const tabs: GameTab[] = []
          for (const entry of slotData) {
            for (const widget of entry.data?.widgets || []) {
              if (widget.type === 'game-tab' && widget.props?.gameIds?.includes(gameExternalId)) {
                tabs.push({
                  tabId: widget.props.tabId,
                  label: widget.props.label,
                  pluginId: entry.pluginId,
                })
              }
            }
          }
          setPluginTabs(tabs)
          onTabsLoaded?.(tabs.map(({ tabId, pluginId }) => ({ tabId, pluginId })))
        }
      } catch {
        // No plugins for this slot
      }
      if (!cancelled) setLoading(false)
    }
    loadTabs()
    return () => { cancelled = true }
  }, [gameExternalId, desktopAPI])

  if (loading || pluginTabs.length === 0) return null

  return (
    <div className="flex items-center gap-1 pb-1 mb-6">
      <button
        onClick={() => onTabChange('info')}
        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
          activeTab === 'info'
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:text-white hover:bg-white/5'
        }`}
      >
        Info
      </button>
      {pluginTabs.map((tab) => (
        <button
          key={tab.tabId}
          onClick={() => onTabChange(tab.tabId)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
            activeTab === tab.tabId
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-white hover:bg-white/5'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
