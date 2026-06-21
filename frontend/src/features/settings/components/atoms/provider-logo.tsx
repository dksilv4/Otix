import EpicLogo from '@/assets/provider-logos/epic.svg?react'

export function ProviderLogo({ platform, className = 'h-4 w-4' }: { platform: string; className?: string }) {
  switch (platform.toLowerCase()) {
    case 'epic':
      return <EpicLogo className={className + ' text-white/70'} />
    default:
      return <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">{platform}</span>
  }
}
