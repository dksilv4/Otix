import { DkAvatar } from '@ui/atoms/avatar'
import { formatConversationTime } from '../../utils/formatters'
import type { Conversation } from '../../types'

interface ConversationListItemProps {
  conversation: Conversation
  isSelected: boolean
  onClick: () => void
  floating?: boolean
}

export const ConversationListItem = ({
  conversation,
  isSelected,
  onClick,
  floating = false,
}: ConversationListItemProps) => {
  const partner = conversation.partner
  const title = conversation.title || partner?.displayName || partner?.username || 'Chat'
  const lastMsg = conversation.lastMessage
  const unreadCount = conversation.unreadCount

  const snippet = lastMsg
    ? lastMsg.isDeleted
      ? 'Message deleted'
      : lastMsg.content || (lastMsg.attachments?.length ? 'Attachment' : 'Shared item')
    : 'No messages yet'

  const baseClasses = floating
    ? `w-full flex items-center gap-3 p-3 text-left transition-all rounded-2xl cursor-pointer border backdrop-blur-xl ${
        isSelected
          ? 'bg-primary/14 border-primary/35 shadow-[0_4px_16px_rgba(var(--primary-rgb),0.14)] ring-1 ring-primary/25'
          : 'bg-[var(--dk-surface-overlay)]/65 hover:bg-[var(--dk-surface-overlay)]/90 border-white/[0.05] hover:border-white/[0.12] shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[var(--dk-shadow-glass)]'
      }`
    : `w-full flex items-center gap-3 p-2.5 text-left transition-colors rounded-xl cursor-pointer ${
        isSelected
          ? 'bg-primary/12 text-foreground'
          : 'hover:bg-[var(--dk-surface-ghost)] text-foreground'
      }`

  return (
    <button
      type="button"
      onClick={onClick}
      className={baseClasses}
    >
      <div className="relative shrink-0">
        <DkAvatar
          src={partner?.avatarUrl}
          name={title}
          size="sm"
          className="!w-9 !h-9"
        />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-xs">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <h5 className="truncate text-[13px] font-semibold text-foreground tracking-[-0.01em]">
            {title}
          </h5>
          {conversation.updatedAt && (
            <span className="shrink-0 text-[11px] text-muted-foreground/60 font-normal">
              {formatConversationTime(conversation.updatedAt)}
            </span>
          )}
        </div>

        <p className={`truncate text-[12px] mt-0.5 leading-snug ${
          unreadCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground/75'
        }`}>
          {snippet}
        </p>
      </div>
    </button>
  )
};
