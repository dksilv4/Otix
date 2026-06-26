import type { WithIdProps } from '../../types'

export function RetroFooter({ id }: WithIdProps) {
  return (
    <footer id={id} className="bg-black border-t border-[#00ff41]/20 py-2 px-4 font-mono text-xs text-[#00ff41]/50 tracking-wider">
      <div className="flex justify-between items-center max-w-7xl mx-auto">
        <span>OTIX v1.0 // RETRO THEME</span>
        <span className="animate-pulse">█</span>
        <span>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
      </div>
    </footer>
  )
}
