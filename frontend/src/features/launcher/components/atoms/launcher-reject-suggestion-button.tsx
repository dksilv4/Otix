/* ── RejectSuggestionButton — dismiss match suggestion ── */

import { X } from 'lucide-react'
import { useToast } from '@/old-features/dk-ui/molecules/toast'
import { useRejectSuggestion } from '@/old-features/game-scanner/game-queries'

interface Props {
  gameId: string
  suggestionMediaId: string
}

export function RejectSuggestionButton({ gameId, suggestionMediaId }: Props) {
  const { toast } = useToast()
  const rejectMutation = useRejectSuggestion()

  const handleClick = () => {
    rejectMutation.mutate({ gameId, suggestionMediaId })
    toast({ title: 'Suggestion Dismissed', variant: 'default' })
  }

  return (
    <button
      onClick={handleClick}
      className="px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[11px] font-semibold text-white/50 hover:text-white/80 transition-all cursor-pointer active:scale-95"
      title="Deny suggestion"
    >
      <X size={13} />
    </button>
  )
}
