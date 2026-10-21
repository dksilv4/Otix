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
        'relative w-screen h-screen flex flex-col overflow-hidden select-none',
        'bg-[var(--dk-surface-root)] text-foreground',
        className,
      )}
    >
      {/* Top draggable area so users can drag the frameless window freely */}
      <div
        className="absolute top-0 left-0 right-0 h-11 z-50 pointer-events-auto"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* Atmospheric glowing brand ambient backdrops */}
      <div
        className="pointer-events-none absolute -top-28 -left-28 w-[450px] h-[450px] rounded-full bg-[var(--primary)]/[0.08] blur-[110px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-28 -right-28 w-[450px] h-[450px] rounded-full bg-[var(--primary)]/[0.05] blur-[110px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-white/[0.015] blur-[90px]"
        aria-hidden="true"
      />

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
