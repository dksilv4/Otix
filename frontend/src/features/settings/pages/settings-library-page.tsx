import { useState, useEffect } from 'react'
import { Gamepad2, Loader2, Library } from 'lucide-react'
import { PluginSlot } from '@/features/settings/components/organisms/settings-plugin-slot'
import { getPluginAPI } from '@/features/settings/pages/settings-plugins-page'
import type { PluginAPI } from '@/features/settings/pages/settings-plugins-page'

export function SettingsLibraryPage() {
  const [pluginApi, setPluginApi] = useState<PluginAPI | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const api = getPluginAPI()
    setPluginApi(api)
    const t = setTimeout(() => setLoading(false), 500)
    return () => clearTimeout(t)
  }, [])

  if (loading) {
    return (
      <div id="settings-library-section" className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight">Game Library</h2>
            <p className="text-sm mt-1 text-white/60">Scan and manage your local game collection.</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        </div>
      </div>
    )
  }

  if (!pluginApi) {
    return (
      <div id="settings-library-section" className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight">Game Library</h2>
            <p className="text-sm mt-1 text-white/60">Scan and manage your local game collection.</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Gamepad2 className="h-12 w-12 text-white/10 mb-4" />
          <p className="text-sm text-white/40 font-medium">Plugins only available in the desktop app</p>
        </div>
      </div>
    )
  }

  return (
    <div id="settings-library-section" className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white tracking-tight">Game Library</h2>
          <p className="text-sm mt-1 text-white/60">Scan and manage your local game collection.</p>
        </div>
        <a
          href="/settings/matching/games"
          className="inline-flex items-center gap-2 h-9 rounded-lg px-4 text-xs font-medium bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors no-underline"
        >
          <Library className="h-3.5 w-3.5" />
          View All Scanned Games
        </a>
      </div>

      <PluginSlot location="library:scan" pluginApi={pluginApi} />
    </div>
  )
}
