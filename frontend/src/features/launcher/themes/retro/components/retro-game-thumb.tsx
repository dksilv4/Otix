import type { GameThumbProps } from '../../types'

export function RetroGameThumb({ icon, alt }: GameThumbProps) {
  return (
    <div className="relative w-16 h-16 border-2 border-[#00ff41]/40 bg-black overflow-hidden"
      style={{ boxShadow: '0 0 8px rgba(0,255,65,0.2), inset 0 0 8px rgba(0,255,65,0.05)' }}>
      {icon ? (
        <img src={icon} alt={alt} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[#00ff41]/40 text-xs font-mono">
          ?
        </div>
      )}
    </div>
  )
}
