import { useTheme } from '@/lib/providers/theme'
import { AppearanceSection } from '../sections/appearance'

export function SettingsAppearancePage() {
  const { theme, setTheme } = useTheme()
  return <AppearanceSection theme={theme} onSetTheme={setTheme} />
}
