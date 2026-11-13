/* ── IsoInstallButton — trigger ISO installer modal ── */

import { Disc } from 'lucide-react'

interface Props {
  onClick: () => void
}

export const IsoInstallButton = ({ onClick }: Props) => {
  return (
    <button
      onClick={onClick}
      className="h-10 px-5 bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer shadow-lg active:scale-95 shrink-0"
    >
      <Disc size={15} className="stroke-[2.5]" />
      <span>Install</span>
    </button>
  )
};
