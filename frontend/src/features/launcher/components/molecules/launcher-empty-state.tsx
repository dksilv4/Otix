import { Gamepad2 } from 'lucide-react'
import { useLauncherTheme } from '@/features/launcher/themes/launcher-theme-context'

export function LauncherEmptyState() {
  const { component } = useLauncherTheme()
  const ThemedComponent = component('EmptyState')
  if (ThemedComponent) return <ThemedComponent />

  return (
    <section className="w-full h-full min-w-[100vw] min-h-[100vh] relative shrink-0 flex items-center justify-center"
      style={{ backgroundColor: 'var(--color-background, #0a0a0d)' }}>
      <div className="text-center space-y-4">
        <Gamepad2 size={48} className="mx-auto opacity-30" />
        <p className="text-sm text-white/40">Select a game to view details</p>
      </div>
    </section>
  )
}
