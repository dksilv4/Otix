import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useTheme } from './theme'

export type LogoVariant = 'infinity' | 'premium' | 'monoline'

export const LOGO_VARIANTS: { value: LogoVariant; label: string; description: string }[] = [
  {
    value: 'infinity',
    label: 'Infinity',
    description: 'The classic Otix infinity symbol.',
  },
  {
    value: 'premium',
    label: 'Premium',
    description: 'Spelled-out OTIX letterforms wrapped in the infinity loop.',
  },
  {
    value: 'monoline',
    label: 'Monoline',
    description: 'A modern circular monoline take on the Otix mark.',
  },
]

const STORAGE_KEY = 'otix-logo-variant'

/**
 * Dark/light color overrides per variant.
 * Each variant can specify what color the SVG should render in for each theme.
 * If omitted (undefined), falls back to `var(--foreground)` — the default text color.
 */
const VARIANT_THEME_COLORS: Record<LogoVariant, { dark?: string; light?: string }> = {
  infinity: {},
  premium: {},
  monoline: {},
}

function getInitialVariant(): LogoVariant {
  if (typeof window === 'undefined') return 'infinity'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'infinity' || stored === 'premium' || stored === 'monoline') return stored
  return 'infinity'
}

const LogoPreferenceContext = createContext<{
  variant: LogoVariant
  setVariant: (variant: LogoVariant) => void
  /** The resolved dark/light color for the current variant, or undefined to use var(--foreground) */
  color: string | undefined
}>({
  variant: 'infinity',
  setVariant: () => {},
  color: undefined,
})

export function useLogoPreference() {
  return useContext(LogoPreferenceContext)
}

export function LogoPreferenceProvider({ children }: { children: ReactNode }) {
  const [variant, setVariant] = useState<LogoVariant>(getInitialVariant)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, variant)
  }, [variant])

  const color = VARIANT_THEME_COLORS[variant][resolvedTheme]

  return (
    <LogoPreferenceContext.Provider value={{ variant, setVariant, color }}>
      {children}
    </LogoPreferenceContext.Provider>
  )
}
