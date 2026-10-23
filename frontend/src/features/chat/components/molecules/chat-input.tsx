import { useState, useRef, type KeyboardEvent, type ChangeEvent } from 'react'
import { ArrowUp, Paperclip, Sparkles, Smile, X, Loader2, AlertCircle } from 'lucide-react'
import { uploadChatAttachment } from '../../utils/upload'

interface ChatInputProps {
  isFriend: boolean
  isSending: boolean
  onSend: (
    content: string,
    options?: {
      attachments?: Array<{
        fileName: string
        fileUrl: string
        contentType: string
        fileSize: number
      }>
    },
  ) => Promise<void>
  onTyping: () => void
  onOpenShareEntity?: () => void
}

const APPLE_EMOJIS = ['❤️', '👍', '😂', '🔥', '🎉', '🎮', '🍿', '✨']

export const ChatInput = ({
  isFriend,
  isSending,
  onSend,
  onTyping,
  onOpenShareEntity,
}: ChatInputProps) => {
  const [text, setText] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [stagedAttachments, setStagedAttachments] = useState<
    Array<{ fileName: string; fileUrl: string; contentType: string; fileSize: number }>
  >([])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  if (!isFriend) {
    return (
      <div className="p-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5 select-none">
        <AlertCircle className="w-4 h-4 shrink-0 text-muted-foreground/70" />
        <span>You and this user are no longer friends. Message history is preserved in read-only mode.</span>
      </div>
    )
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    onTyping()
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    setIsUploading(true)
    try {
      const uploaded = await uploadChatAttachment(file)
      setStagedAttachments((prev) => [...prev, uploaded])
    } catch {
      // Handled silently
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveAttachment = (index: number) => {
    setStagedAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAddEmoji = (emoji: string) => {
    setText((prev) => prev + emoji)
    setShowEmojiPicker(false)
    textareaRef.current?.focus()
  }

  const handleSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed && stagedAttachments.length === 0) return
    if (isSending || isUploading) return

    const currentText = trimmed
    const currentAttachments = [...stagedAttachments]

    setText('')
    setStagedAttachments([])

    await onSend(currentText, {
      attachments: currentAttachments,
    })
  }

  const canSend = (text.trim().length > 0 || stagedAttachments.length > 0) && !isSending && !isUploading

  return (
    <div className="relative pt-2 pb-1">
      {/* Apple Quick Emoji Bar */}
      {showEmojiPicker && (
        <div className="absolute bottom-full left-3 mb-2 flex items-center gap-1.5 rounded-full bg-[var(--dk-surface-overlay)]/95 border border-white/[0.08] p-1.5 shadow-[var(--dk-shadow-dialog)] backdrop-blur-2xl z-20 animate-in fade-in zoom-in-95 duration-150">
          {APPLE_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleAddEmoji(emoji)}
              className="text-base hover:scale-125 active:scale-95 transition-transform px-1 cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Staged Attachments Capsule */}
      {stagedAttachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2 px-1">
          {stagedAttachments.map((att, idx) => (
            <div
              key={att.fileUrl}
              className="flex items-center gap-1.5 rounded-full bg-[var(--dk-surface-ghost)] px-2.5 py-1 text-xs text-foreground border border-white/[0.04]"
            >
              <Paperclip className="w-3 h-3 text-muted-foreground" />
              <span className="truncate max-w-[130px] font-medium">{att.fileName}</span>
              <button
                type="button"
                onClick={() => handleRemoveAttachment(idx)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Apple-style Capsule Input Bar */}
      <div className="flex items-center gap-1 rounded-full bg-[var(--dk-surface-ghost)] border border-white/[0.06] pl-2 pr-1.5 py-1 transition-all focus-within:ring-1 focus-within:ring-primary/40 shadow-xs">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Attachment Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/75 hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition shrink-0 cursor-pointer"
          title="Add attachment"
        >
          {isUploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          ) : (
            <Paperclip className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Share Otix Entity Button */}
        {onOpenShareEntity && (
          <button
            type="button"
            onClick={onOpenShareEntity}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/75 hover:text-primary hover:bg-[var(--dk-surface-ghost-hover)] transition shrink-0 cursor-pointer"
            title="Share game or media"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Emoji Button */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker((prev) => !prev)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/75 hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition shrink-0 cursor-pointer"
          title="Emoji"
        >
          <Smile className="w-3.5 h-3.5" />
        </button>

        {/* Auto-growing Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          rows={1}
          className="flex-1 max-h-24 resize-none bg-transparent py-1 px-1 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none leading-relaxed tracking-[-0.01em]"
        />

        {/* Apple Circular Send Arrow Button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          className={`flex h-7 w-7 items-center justify-center rounded-full transition-all shrink-0 cursor-pointer ${
            canSend
              ? 'bg-primary text-primary-foreground hover:scale-105 active:scale-95 shadow-sm'
              : 'bg-muted/40 text-muted-foreground/40 cursor-default'
          }`}
          title="Send message"
        >
          {isSending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ArrowUp className="w-4 h-4 stroke-[2.5]" />
          )}
        </button>
      </div>
    </div>
  )
};
