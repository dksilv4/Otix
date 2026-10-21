import { DkBadge } from '@ui/atoms/badge'

interface PlatformBadgeProps {
  label: string
  variant?: 'default' | 'secondary' | 'outline'
  className?: string
}

export const PlatformBadge = ({
  label,
  variant = 'secondary',
  className = '',
}: PlatformBadgeProps) => {
  return (
    <DkBadge
      variant={variant}
      size="sm"
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${className}`}
    >
      {label}
    </DkBadge>
  )
}
