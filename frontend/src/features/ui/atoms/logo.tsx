import logoSvg from '@/assets/otix-logo.svg?raw'

interface LogoProps {
  className?: string
}

export function Logo({ className = 'h-7' }: LogoProps) {
  return (
    <div
      className={`${className} [&_svg]:h-full [&_svg]:w-auto`}
      style={{ color: 'var(--foreground)' }}
      dangerouslySetInnerHTML={{ __html: logoSvg }}
    />
  )
}
