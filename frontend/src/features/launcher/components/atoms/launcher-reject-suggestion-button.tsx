/* ── RejectSuggestionButton — dismiss match suggestion ── */

import { X } from 'lucide-react'
import { useToast } from '@ui/molecules/toast'
import { useRejectSuggestion } from '@/features/launcher/data/game-queries'

interface Props {
  gameId: string
  suggestionMediaId: string
}

export const RejectSuggestionButton = ({ gameId, suggestionMediaId }: Props) => {
  const { toast } = useToast()
  const rejectMutation = useRejectSuggestion()

  const handleClick = () => {
    rejectMutation.mutate({ gameId, suggestionMediaId })
    toast({ title: 'Suggestion Dismissed', variant: 'default' })
  }

  return (
    <button
      onClick={handleClick}
      className="px-3 py-2.5 bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] rounded-xl text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer active:scale-95"
      title="Deny suggestion"
    >
      <X size={13} />
    </button>
  )
};
