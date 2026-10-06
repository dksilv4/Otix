import { useNavigate } from "@tanstack/react-router"
import { useUserLists, ListCard } from "@list"

export const ListsPreviewSection = () => {
  const navigate = useNavigate()
  const { data: lists, isLoading } = useUserLists()

  const listItems = Array.isArray(lists) ? lists.filter(Boolean) : []

  if (isLoading || listItems.length === 0) return null

  const preview = listItems.slice(0, 3)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Your Lists
        </h2>
        <button
          onClick={() => navigate({ to: "/library/lists" })}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {preview.map((list) => (
          <ListCard key={list.id} list={list} />
        ))}
        {listItems.length > 3 && (
          <button
            type="button"
            onClick={() => navigate({ to: "/library/lists" })}
            className="flex items-center justify-center rounded-3xl border border-dashed border-white/[0.08] bg-[var(--dk-surface-glass)]/50 hover:bg-[var(--dk-surface-elevated)] transition-all duration-200 p-6"
          >
            <span className="text-sm text-muted-foreground">
              +{listItems.length - 3} more lists
            </span>
          </button>
        )}
      </div>
    </div>
  )
};
