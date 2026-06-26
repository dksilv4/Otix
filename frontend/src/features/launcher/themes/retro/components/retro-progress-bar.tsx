import type { ProgressBarProps } from '../../types'

export function RetroProgressBar({ progress }: ProgressBarProps) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 h-1 bg-black border-t border-[#00ff41]/30">
      <div
        className="h-full bg-[#00ff41]"
        style={{
          width: `${progress}%`,
          boxShadow: '0 0 6px rgba(0,255,65,0.6)',
          transition: 'width 50ms linear',
        }}
      />
      {/* LED segments */}
      <div className="absolute inset-0 flex" style={{ gap: '4px' }}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="h-full flex-1 border-r border-black/60 last:border-r-0" />
        ))}
      </div>
    </div>
  )
}
