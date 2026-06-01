import logoSvg from '@/assets/otix-logo.svg?raw'

interface LogoProps {
  className?: string
  color?: string
}

export function Logo({ className = 'h-7', color }: LogoProps) {
  return (
    <div
      className={`${className} [&_svg]:h-full [&_svg]:w-auto`}
      style={{ color: color ?? 'var(--foreground)' }}
      dangerouslySetInnerHTML={{ __html: logoSvg }}
    />
  )
}
