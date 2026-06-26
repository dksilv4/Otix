/* ── LauncherLoading — fullscreen loading spinner ── */

import { Gamepad2 } from 'lucide-react'
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherLoading({ id }: { id?: string }) {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('LoadingState')
  if (ThemedComponent) return <ThemedComponent id={id} />

  return (
    <div id={id} className="flex items-center justify-center w-full text-white"
      style={{ height: 'calc(100vh - 5rem)', backgroundColor: 'var(--color-background, #0a0a0d)' }}>
      <div className="text-center space-y-4">
        <Gamepad2 size={48} className="mx-auto opacity-30 animate-bounce"/>
        <p className="text-sm text-white/40">Loading Game Launcher...</p>
      </div>
    </div>
  )
}
