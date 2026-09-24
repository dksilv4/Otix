import infinitySvg from '@/assets/otix-logo.svg?raw'

interface DkLogoProps {
  className?: string
  /** Explicit color override. Defaults to var(--foreground). */
  color?: string
  /** @deprecated Logo variants are no longer supported. */
  variant?: string
}

function DkLogo({ className = 'h-7', color }: DkLogoProps) {
  return (
    <div
      className={`${className} [&_svg]:h-full [&_svg]:w-auto [&_svg]:overflow-visible`}
      style={{ color: color ?? 'var(--foreground)' }}
      dangerouslySetInnerHTML={{ __html: infinitySvg }}
    />
  )
}

export { DkLogo, DkLogo as Logo }
export type { DkLogoProps }
