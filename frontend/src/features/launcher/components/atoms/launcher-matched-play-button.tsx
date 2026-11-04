import { BookOpen } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'

interface Props {
  mediaId: string
}

export const MatchedPlayButton = ({ mediaId }: Props) => {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate({ to: '/media/$mediaType/$mediaId' as const, params: { mediaType: 'game', mediaId } })}
      className="h-10 px-5 bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95 shrink-0"
    >
      <BookOpen size={15} className="stroke-[2.5]" />
      <span>View Details</span>
    </button>
  )
};
