import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { DownloadCloud, Download, Server } from 'lucide-react'
import { SlotRenderer, useSlotData, type PluginSettingsTab } from '@/features/_config/slots'

interface PluginSettingsPageProps {
  tab?: PluginSettingsTab
}

export function PluginSettingsPage({ tab }: PluginSettingsPageProps) {
  if (!tab) {
    return (
      <div className="max-w-xl mx-auto py-16 px-6 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-primary shadow-lg">
          <DownloadCloud className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Looking for Usenet or Downloader Settings?</h2>
          <p className="text-sm text-white/60 leading-relaxed">
            No plugin settings available here. SABnzbd and Prowlarr are configured on your self-hosted Otix Server node.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            to="/downloads"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-black font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            <Download className="h-4 w-4" />
            Go to Downloads & Usenet
          </Link>
          <Link
            to="/settings/launcher"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-white/80 font-medium text-sm hover:bg-white/10 transition-colors"
          >
            <Server className="h-4 w-4" />
            Game Servers
          </Link>
        </div>
      </div>
    )
  }

  const [activeSection, setActiveSection] = useState(tab.sections[0]?.id)
  const section = tab.sections.find(s => s.id === activeSection)
  const { data, isLoading } = useSlotData(`settings/${tab.id}`)

  const handleAction = async (pluginId: string, actionKey: string, payload: unknown) => {
    if (!(window as any).desktopAPI?.plugin?.callData) return
    try {
      await (window as any).desktopAPI.plugin.callData(pluginId, 'handleAction', actionKey, payload)
    } catch (err) {
      console.error(`[PluginSettingsPage] Action "${actionKey}" failed for ${pluginId}:`, err)
    }
  }

  if (tab.sections.length > 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{tab.label}</h1>
        <div style={{ display: 'flex', gap: 4 }}>
          {tab.sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--dk-radius-sm)',
                border: 'none',
                backgroundColor: s.id === activeSection
                  ? 'var(--dk-surface-raised)'
                  : 'transparent',
                color: s.id === activeSection
                  ? 'var(--text-primary)'
                  : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: s.id === activeSection ? 600 : 400,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        {section && (
          <SlotRenderer
            contributions={data?.[section.slot] || []}
            loading={isLoading}
            onAction={handleAction}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>{tab.label}</h1>
      {section && (
        <SlotRenderer
          contributions={data?.[section.slot] || []}
          loading={isLoading}
          onAction={handleAction}
        />
      )}
    </div>
  )
}
