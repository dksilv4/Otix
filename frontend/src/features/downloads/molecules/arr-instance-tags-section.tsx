import { useState, type KeyboardEvent } from 'react'
import { Plus, Tag, X } from 'lucide-react'
import { DkInput } from '@ui/atoms/input'
import { POPULAR_ARR_ROUTING_TAGS } from '../utils/arr-routing'

export interface ArrInstanceTagsSectionProps {
  tags?: string[]
  onChange: (tags: string[]) => void
}

export const ArrInstanceTagsSection = ({
  tags = [],
  onChange,
}: ArrInstanceTagsSectionProps) => {
  const [newTagInput, setNewTagInput] = useState('')

  const handleAddTag = (rawTag: string) => {
    const trimmed = rawTag.trim()
    if (!trimmed) return
    const exists = tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())
    if (!exists) {
      onChange([...tags, trimmed])
    }
    setNewTagInput('')
  }

  const handleRemoveTag = (indexToRemove: number) => {
    onChange(tags.filter((_, idx) => idx !== indexToRemove))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag(newTagInput)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <Tag className="h-3.5 w-3.5 text-primary" />
        <span>Routing Tags &amp; Auto-Match</span>
      </div>

      <p className="text-xs text-muted-foreground">
        Titles with matching genres, language (e.g. Japanese for anime), or keywords automatically default to this instance when requested.
      </p>

      {/* Active tags */}
      <div className="flex flex-wrap items-center gap-1.5 min-h-7">
        {tags.length > 0 ? (
          tags.map((tag, idx) => (
            <span
              key={`${tag}-${idx}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2.5 py-0.5 text-xs font-semibold border border-white/[0.04]"
            >
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => handleRemoveTag(idx)}
                className="h-3.5 w-3.5 rounded-full inline-flex items-center justify-center hover:bg-primary/20 text-primary transition-colors cursor-pointer"
                title={`Remove ${tag}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground/75 italic">
            No routing tags configured (acts as general instance).
          </span>
        )}
      </div>

      {/* Quick-add suggestions */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] font-medium text-muted-foreground">Quick add:</span>
        {POPULAR_ARR_ROUTING_TAGS.map((popTag) => {
          const isAdded = tags.some((t) => t.toLowerCase() === popTag.toLowerCase())
          if (isAdded) return null
          return (
            <button
              key={popTag}
              type="button"
              onClick={() => handleAddTag(popTag)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground/80 hover:text-foreground transition-colors border border-white/[0.04] cursor-pointer"
            >
              <Plus className="h-2.5 w-2.5 text-primary" />
              <span>{popTag}</span>
            </button>
          )
        })}
      </div>

      {/* Custom tag input */}
      <div className="flex items-center gap-2 pt-1">
        <div className="flex-1 min-w-0">
          <DkInput
            id="arr-new-tag-input"
            placeholder="Type custom tag (e.g. Anime, 4K, Japan)..."
            value={newTagInput}
            onChange={(e) => setNewTagInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          type="button"
          onClick={() => handleAddTag(newTagInput)}
          disabled={!newTagInput.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Tag</span>
        </button>
      </div>
    </div>
  )
}
