// Map platform/provider slugs to their SVG logo paths
const PROVIDER_LOGOS: Record<string, string> = {
  epic: '/src/assets/provider-logos/epic.svg',
  steam: '/src/assets/provider-logos/steam.svg',
  gog: '/src/assets/provider-logos/gog.svg',
  spotify: '/src/assets/provider-logos/spotify.svg',
  plex: '/src/assets/provider-logos/plex.svg',
}

export function ProviderLogo({ platform, className = 'h-4 w-4' }: { platform: string; className?: string }) {
  const src = PROVIDER_LOGOS[platform.toLowerCase()]
  if (!src) {
    return <span className="text-[10px] font-medium uppercase tracking-wider">{platform}</span>
  }
  return (
    <img
      src={src}
      alt={platform}
      className={className + ' object-contain'}
      title={platform}
    />
  )
}
