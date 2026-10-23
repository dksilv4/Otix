import { useState, useRef, useEffect } from 'react'
import { Pencil, Trash2, Paperclip, MoreHorizontal, SmilePlus } from 'lucide-react'
import { DkAvatar } from '@ui/atoms/avatar'
import { ChatEmbedCard } from './chat-embed-card'
import { formatMessageTimestamp, formatFileSize } from '../../utils/formatters'
import { groupReactions, APPLE_TAPBACKS } from '../../utils/reactions'
import { useSmartPlacement } from '../../hooks/use-smart-placement'
import { useLongPress } from '../../hooks/use-long-press'
import type { ChatMessage, EntityEmbedMetadata } from '../../types'

interface ChatBubbleProps {
  message: ChatMessage
  isOutgoing: boolean
  currentUserId: number
  onReact: (emoji: string) => void
  onEdit: (messageId: number, content: string) => void
  onDelete: (messageId: number) => void
}

export const ChatBubble = ({
  message,
  isOutgoing,
  currentUserId,
  onReact,
  onEdit,
  onDelete,
}: ChatBubbleProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [showTapbackBar, setShowTapbackBar] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)

  const bubbleRef = useRef<HTMLDivElement>(null)

  const { placement, align, spaceAbove } = useSmartPlacement({
    triggerRef: bubbleRef,
    isOpen: showTapbackBar,
    isOutgoing,
    minHeadroom: 48,
  })

  // Apple-style click-and-hold (long-press) interaction
  const longPress = useLongPress({
    onLongPress: () => {
      setShowTapbackBar(true)
      setShowMoreActions(false)
    },
    threshold: 380,
    disabled: message.isDeleted || isEditing,
  })

  // Dismiss tapback and actions on outside click or Escape
  useEffect(() => {
    if (!showTapbackBar && !showMoreActions) return

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (bubbleRef.current && !bubbleRef.current.contains(target)) {
        setShowTapbackBar(false)
        setShowMoreActions(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowTapbackBar(false)
        setShowMoreActions(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showTapbackBar, showMoreActions])

  const reactions = groupReactions(message.reactions, currentUserId)
  const isDeleted = message.isDeleted
  const embedMeta =
    message.contentType === 'entity_embed' && message.metadata
      ? (message.metadata as unknown as EntityEmbedMetadata)
      : null

  const handleSaveEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      onEdit(message.id, editContent.trim())
    }
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditContent(message.content)
    setIsEditing(false)
  }

  return (
    <div
      className={`group relative flex gap-2 px-1 py-1 transition-colors ${
        isOutgoing ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* Sender Avatar for incoming messages */}
      {!isOutgoing && (
        <DkAvatar
          src={message.sender.avatarUrl}
          name={message.sender.displayName || message.sender.username}
          size="sm"
          className="mt-auto shrink-0 !w-7 !h-7 text-[11px]"
        />
      )}

      {/* Bubble + Quick Action Row */}
      <div
        className={`relative flex items-center gap-1.5 max-w-[85%] sm:max-w-[78%] ${
          isOutgoing ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        <div
          className={`relative flex flex-col ${
            isOutgoing ? 'items-end' : 'items-start'
          }`}
        >
          {/* Message Bubble Container with Long-Press & Double-Click */}
          <div
            ref={bubbleRef}
            onDoubleClick={(e) => {
              if ((e.target as HTMLElement).closest('button, a, textarea')) return
              setShowTapbackBar((prev) => !prev)
            }}
            {...longPress.handlers}
            className={`relative px-3.5 py-2 text-[13px] leading-[1.38] tracking-[-0.01em] transition-all select-text ${
              isDeleted
                ? 'rounded-[18px] bg-[var(--dk-surface-ghost)]/60 text-muted-foreground/60 italic border border-white/[0.04]'
                : isOutgoing
                  ? 'rounded-[18px] rounded-br-[4px] bg-primary text-primary-foreground font-normal shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                  : 'rounded-[18px] rounded-bl-[4px] bg-[var(--dk-surface-ghost)] text-foreground font-normal'
            }`}
          >
            {/* Apple Tapback Reactions Badge */}
            {reactions.length > 0 && !isDeleted && (
              <div
                className={`absolute ${
                  spaceAbove < 20 ? '-bottom-2.5' : '-top-2.5'
                } z-10 flex items-center gap-1 rounded-full bg-[var(--dk-surface-overlay)]/95 backdrop-blur-xl border border-white/[0.08] px-1.5 py-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.18)] text-[11px] ${
                  isOutgoing ? 'right-2' : 'left-2'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                {reactions.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onReact(r.emoji)
                    }}
                    className={`flex items-center gap-0.5 hover:scale-115 transition-transform cursor-pointer ${
                      r.hasReacted ? 'scale-105 font-bold text-primary' : ''
                    }`}
                    title={`Reacted ${r.emoji}`}
                  >
                    <span>{r.emoji}</span>
                    {r.count > 1 && (
                      <span className="text-[10px] font-semibold text-muted-foreground">{r.count}</span>
                    )}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowTapbackBar((prev) => !prev)
                  }}
                  className="text-[10px] text-muted-foreground/60 hover:text-foreground px-0.5 cursor-pointer transition-colors"
                  title="Add reaction"
                >
                  +
                </button>
              </div>
            )}

            {isDeleted ? (
              <span>Message deleted</span>
            ) : isEditing ? (
              <div className="flex flex-col gap-2 min-w-[210px]" onClick={(e) => e.stopPropagation()}>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full rounded-xl bg-[var(--dk-surface-overlay)] text-foreground p-2 text-xs resize-none outline-none ring-1 ring-primary/40 leading-relaxed"
                  rows={2}
                  autoFocus
                />
                <div className="flex items-center justify-end gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-2 py-0.5 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="px-2.5 py-0.5 rounded-lg bg-primary text-primary-foreground font-medium cursor-pointer shadow-sm"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                {message.content && (
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                )}

                {embedMeta && <ChatEmbedCard embed={embedMeta} />}

                {message.attachments && message.attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {message.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={att.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs transition truncate ${
                          isOutgoing
                            ? 'bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground'
                            : 'bg-[var(--dk-surface-overlay)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground'
                        }`}
                      >
                        <Paperclip className="w-3.5 h-3.5 shrink-0 opacity-70" />
                        <span className="truncate flex-1 font-medium">{att.fileName}</span>
                        <span className="text-[10px] opacity-60 shrink-0">
                          {formatFileSize(att.fileSize)}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Apple-style Tapback Bar with Smart Placement */}
            {showTapbackBar && !isDeleted && (
              <div
                className={`absolute z-30 flex items-center gap-1 rounded-full bg-[var(--dk-surface-overlay)]/95 backdrop-blur-2xl border border-white/[0.08] shadow-[0_8px_24px_rgba(0,0,0,0.28)] px-2 py-1 animate-in fade-in zoom-in-95 duration-150 select-none ${
                  placement === 'bottom'
                    ? reactions.length > 0 && spaceAbove < 20
                      ? 'top-full mt-3 right-0'
                      : 'top-full mt-1.5 right-0'
                    : reactions.length > 0 && spaceAbove >= 20
                      ? 'bottom-full mb-3'
                      : 'bottom-full mb-1.5'
                } ${
                  placement === 'bottom'
                    ? 'right-0'
                    : align === 'right'
                      ? 'right-0'
                      : 'left-0'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                {APPLE_TAPBACKS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onReact(emoji)
                      setShowTapbackBar(false)
                    }}
                    className={`relative z-10 p-1 text-base hover:scale-130 active:scale-95 transition-transform duration-100 cursor-pointer rounded-full hover:bg-white/[0.08] ${
                      reactions.some((r) => r.emoji === emoji && r.hasReacted)
                        ? 'scale-115 font-bold'
                        : ''
                    }`}
                    title={`React with ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Apple Style Meta (Time + Edited) */}
          <div
            className={`flex items-center gap-1 text-[10px] text-muted-foreground/60 tracking-tight select-none mt-0.5 px-1 ${
              isOutgoing ? 'justify-end' : 'justify-start'
            }`}
          >
            <span>{formatMessageTimestamp(message.createdAt)}</span>
            {message.editedAt && !isDeleted && <span>• edited</span>}
          </div>
        </div>

        {/* Subtle Quick Actions beside the bubble */}
        {!isDeleted && !isEditing && (
          <div
            className={`flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0 ${
              showTapbackBar || showMoreActions ? 'opacity-100' : ''
            }`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowTapbackBar((prev) => !prev)
                setShowMoreActions(false)
              }}
              className={`p-1.5 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-all cursor-pointer ${
                showTapbackBar ? 'text-primary bg-[var(--dk-surface-ghost-hover)]' : ''
              }`}
              title="React"
            >
              <SmilePlus className="w-3.5 h-3.5" />
            </button>

            {isOutgoing && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowMoreActions((prev) => !prev)
                    setShowTapbackBar(false)
                  }}
                  className={`p-1.5 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-all cursor-pointer ${
                    showMoreActions ? 'text-primary bg-[var(--dk-surface-ghost-hover)]' : ''
                  }`}
                  title="More options"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>

                {showMoreActions && (
                  <div
                    className={`absolute z-40 flex items-center gap-1 rounded-xl bg-[var(--dk-surface-overlay)] border border-white/[0.08] p-1 shadow-lg backdrop-blur-2xl ${
                      isOutgoing ? 'right-0' : 'left-0'
                    } ${placement === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5'}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setIsEditing(true)
                        setShowMoreActions(false)
                      }}
                      className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition cursor-pointer"
                      title="Edit"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(message.id)
                        setShowMoreActions(false)
                      }}
                      className="p-1 text-muted-foreground hover:text-destructive rounded-lg transition cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
};
