import { useState, useEffect } from "react"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserListOut, UserListCreate } from "../list-queries"

interface ListComposerProps {
  open: boolean
  onClose: () => void
  onSave: (data: UserListCreate) => void
  initial?: UserListOut | null
  isSaving?: boolean
}

export function ListComposer({
  open,
  onClose,
  onSave,
  initial,
  isSaving,
}: ListComposerProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isPublic, setIsPublic] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "")
      setDescription(initial?.description ?? "")
      setIsPublic(initial?.isPublic ?? false)
    }
  }, [open, initial])

  if (!open) return null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), description: description.trim() || null, isPublic })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className={cn(
          "relative w-full max-w-md rounded-[2rem]",
          "bg-[var(--dk-surface-overlay)] backdrop-blur-xl",
          "shadow-[var(--dk-shadow-glass)]",
          "border border-white/[0.06]",
          "p-6"
        )}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            {initial ? "Edit List" : "New List"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)] transition-colors"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
              placeholder="My list name..."
              className={cn(
                "w-full rounded-xl border border-white/[0.06] bg-[var(--dk-surface-base)]",
                "px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary/50"
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional description..."
              className={cn(
                "w-full rounded-xl border border-white/[0.06] bg-[var(--dk-surface-base)]",
                "px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              )}
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="rounded border-white/20 bg-[var(--dk-surface-base)]"
            />
            <span className="text-sm text-foreground">Make this list public</span>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "flex-1 rounded-xl border border-white/[0.06] px-4 py-2.5 text-sm font-medium",
                "text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)]",
                "transition-colors"
              )}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSaving}
              className={cn(
                "flex-1 rounded-xl px-4 py-2.5 text-sm font-medium",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 disabled:opacity-50 transition-opacity"
              )}
            >
              {isSaving ? "Saving..." : initial ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
