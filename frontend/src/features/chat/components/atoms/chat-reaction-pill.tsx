interface ChatReactionPillProps {
  emoji: string
  count: number
  hasReacted: boolean
  onClick: () => void
}

export const ChatReactionPill = ({
  emoji,
  count,
  hasReacted,
  onClick,
}: ChatReactionPillProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
        hasReacted
          ? 'bg-primary/20 text-primary border border-primary/30'
          : 'bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-glass)] text-foreground border border-white/[0.04]'
      }`}
    >
      <span>{emoji}</span>
      <span className="font-medium text-[11px]">{count}</span>
    </button>
  )
};
