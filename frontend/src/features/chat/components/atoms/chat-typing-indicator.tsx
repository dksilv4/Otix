interface ChatTypingIndicatorProps {
  usernames: string[]
}

export const ChatTypingIndicator = ({ usernames }: ChatTypingIndicatorProps) => {
  if (!usernames || usernames.length === 0) return null

  const label =
    usernames.length === 1
      ? `${usernames[0]} is typing...`
      : usernames.length === 2
        ? `${usernames[0]} and ${usernames[1]} are typing...`
        : 'Multiple people are typing...'

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground animate-fade-in">
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" />
      </div>
      <span className="italic">{label}</span>
    </div>
  )
};
