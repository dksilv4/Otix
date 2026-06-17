import { useTheme } from '@/lib/providers/theme'
import { AppearanceSection } from '@/old-features/settings/organisms/settings-sections/appearance'

export function SettingsAppearancePage() {
  const { theme, setTheme } = useTheme()
  return <AppearanceSection theme={theme} onSetTheme={setTheme} />
}
