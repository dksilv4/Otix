// frontend/src/features/settings/components/PluginSettingsPage.tsx
import { useState } from 'react'
import { SlotRenderer, useSlotData, type PluginSettingsTab } from '@/features/_config/slots'

interface PluginSettingsPageProps {
  tab: PluginSettingsTab
}

export function PluginSettingsPage({ tab }: PluginSettingsPageProps) {
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
