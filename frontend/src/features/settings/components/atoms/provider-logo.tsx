import { lazy, Suspense } from 'react'

// Map platform slugs to lazy-loaded React SVG components
const PROVIDER_LOGOS: Record<string, React.LazyExoticComponent<React.ComponentType<React.SVGProps<SVGSVGElement>>>> = {
  epic: lazy(() => import('@/assets/provider-logos/epic.svg?react')),
}

export function ProviderLogo({ platform, className = 'h-4 w-4' }: { platform: string; className?: string }) {
  const LogoSvg = PROVIDER_LOGOS[platform.toLowerCase()]
  if (!LogoSvg) {
    return <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">{platform}</span>
  }
  return (
    <Suspense fallback={<span className="text-[10px] text-white/50">{platform}</span>}>
      <LogoSvg className={className + ' text-white/70'} />
    </Suspense>
  )
}
