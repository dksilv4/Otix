/* ── IsoInstallButton — trigger ISO installer modal ── */

import { Disc } from 'lucide-react'

interface Props {
  onClick: () => void
}

export const IsoInstallButton = ({ onClick }: Props) => {
  return (
    <button
      onClick={onClick}
      className="px-5.5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95"
    >
      <Disc size={14} /> Install
    </button>
  )
};
