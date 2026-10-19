import { Link } from "@tanstack/react-router"
import { Check, Share2 } from "lucide-react"
import { useModal } from "@/lib/modals"
import { ShareModal } from "./list-actions"
import type { UserListOut } from "../../list-queries"
import { cn } from "@/lib/utils"
import "./list-card.scss"

interface ListCardProps {
  list: UserListOut
  selectable?: boolean
  selected?: boolean
  onSelect?: (id: string, selected: boolean) => void
}

export const ListCard = ({ list, selectable = false, selected = false, onSelect }: ListCardProps) => {
  const { openModal } = useModal()

  const handleClick = (e: React.MouseEvent) => {
    if (selectable) {
      e.preventDefault()
      onSelect?.(list.id, !selected)
    }
  }

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const close = openModal(<ShareModal list={list} onClose={() => close()} />)
  }

  return (
    <Link
      to="/library/$listId"
      params={{ listId: list.id }}
      onClick={handleClick}
      className={cn(
        "dk-list-card relative group transition-all duration-200",
        selectable && "cursor-pointer select-none",
        selected && "ring-2 ring-primary border-primary bg-primary/10",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="dk-list-card__title flex-1">{list.name}</h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {!selectable && (
            <button
              type="button"
              onClick={handleShare}
              title={`Share ${list.name}`}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground opacity-70 group-hover:opacity-100 hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground transition-all"
              aria-label={`Share ${list.name}`}
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          )}
          {selectable && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onSelect?.(list.id, !selected)
              }}
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border transition-all",
                selected
                  ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                  : "border-border/40 bg-[var(--dk-surface-ghost)] group-hover:border-border",
              )}
              aria-label={selected ? `Deselect ${list.name}` : `Select ${list.name}`}
            >
              {selected && <Check className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {list.description && (
        <p className="dk-list-card__description">
          {list.description}
        </p>
      )}
      <div className="dk-list-card__meta">
        {list.isPublic ? (
          <span className="dk-list-card__badge dk-list-card__badge--public">
            Public
          </span>
        ) : (
          <span className="dk-list-card__badge dk-list-card__badge--private">
            Private
          </span>
        )}
        {list.itemCount != null && (
          <span className="text-[11px] text-muted-foreground">
            {list.itemCount} {list.itemCount === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>
    </Link>
  )
};
