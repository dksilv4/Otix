import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface InstallerWindowFrameProps {
  children: ReactNode
  className?: string
}

export const InstallerWindowFrame = ({
  children,
  className,
}: InstallerWindowFrameProps) => {
  return (
    <div
      className={cn(
        'installer-draggable-frame relative w-screen h-screen flex flex-col overflow-hidden select-none',
        'bg-gradient-to-br from-[#07080a] via-[#0d0f17] to-[#08090d] text-foreground',
        className,
      )}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Top Window Drag Anchor Strip */}
      <div
        className="absolute top-0 left-0 right-0 h-16 z-30 pointer-events-auto"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        aria-hidden="true"
      />

      {/* Rich Atmospheric Luminous Ambient Background Glows */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 w-[520px] h-[520px] rounded-full bg-[var(--primary)]/[0.24] blur-[120px] animate-pulse"
        style={{ animationDuration: '7s' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-24 -right-24 w-[500px] h-[500px] rounded-full bg-[var(--primary)]/[0.20] blur-[130px] animate-pulse"
        style={{ animationDuration: '9s' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute top-1/4 right-1/4 w-[380px] h-[380px] rounded-full bg-indigo-500/[0.16] blur-[110px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-1/3 left-1/3 w-[340px] h-[340px] rounded-full bg-violet-500/[0.12] blur-[100px]"
        aria-hidden="true"
      />

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
