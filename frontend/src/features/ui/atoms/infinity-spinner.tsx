import logoSvg from '@/assets/otix-logo.svg?raw'
import { cn } from '@/lib/utils'

const logoViewBox = logoSvg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 2048 2048'
const allPathsHtml = (logoSvg.match(/<path\b[^>]*\/>/g) ?? []).join('')
const allPathsMaskHtml = allPathsHtml.replace(/fill="currentColor"/g, 'fill="white"')
const infinityMotionPath =
  'M445 1024C445 700 805 745 1024 1024C1243 1303 1603 1348 1603 1024C1603 700 1243 745 1024 1024C805 1303 445 1348 445 1024Z'

export function InfinitySpinner({ className }: { className?: string }) {
  const maskId = 'otix-infinity-loader-mask'

  return (
    <div
      aria-label="Loading"
      className={cn('otix-infinity-loader relative h-full w-full', className)}
      role="status"
    >
      <span className="sr-only">Loading</span>
      <svg
        aria-hidden="true"
        className="otix-infinity-loader__svg"
        focusable="false"
        viewBox={logoViewBox}
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <rect fill="black" height="2048" width="2048" x="0" y="0" />
            <g dangerouslySetInnerHTML={{ __html: allPathsMaskHtml }} />
          </mask>
        </defs>
        <g
          className="otix-infinity-loader__shape"
          dangerouslySetInnerHTML={{ __html: allPathsHtml }}
        />
        <path
          className="otix-infinity-loader__snake"
          d={infinityMotionPath}
          mask={`url(#${maskId})`}
          pathLength="240"
        />
      </svg>
    </div>
  )
}
