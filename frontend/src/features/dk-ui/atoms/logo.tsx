import logoSvg from '@/assets/otix-logo.svg?raw'

interface DkLogoProps {
  className?: string
  color?: string
}

function DkLogo({ className = 'h-7', color }: DkLogoProps) {
  return (
    <div
      className={`${className} [&_svg]:h-full [&_svg]:w-auto`}
      style={{ color: color ?? 'var(--foreground)' }}
      dangerouslySetInnerHTML={{ __html: logoSvg }}
    />
  )
}

export { DkLogo, DkLogo as Logo }
