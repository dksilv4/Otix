// TODO: Review this file
import { useLogoPreference, type LogoVariant } from '@/lib/providers/logo-preference'
import infinitySvg from '@/assets/otix-logo.svg?raw'
import premiumSvg from '@/assets/otix-logo-premium.svg?raw'
import monolineSvg from '@/assets/otix-logo-monoline.svg?raw'

const SVG_MAP: Record<LogoVariant, string> = {
  infinity: infinitySvg,
  premium: premiumSvg,
  monoline: monolineSvg,
}

interface DkLogoProps {
  className?: string
  /** Explicit color override. Defaults to the variant's theme-aware color, then to var(--foreground). */
  color?: string
  /** Logo variant. Defaults to the user's saved preference. */
  variant?: LogoVariant
}

function DkLogo({ className = 'h-7', color, variant: variantProp }: DkLogoProps) {
  const { variant: preferredVariant, color: themeColor } = useLogoPreference()
  const variant = variantProp ?? preferredVariant

  return (
    <div
      className={`${className} [&_svg]:h-full [&_svg]:w-auto`}
      style={{ color: color ?? themeColor ?? 'var(--foreground)' }}
      dangerouslySetInnerHTML={{ __html: SVG_MAP[variant] }}
    />
  )
}

export { DkLogo, DkLogo as Logo }
