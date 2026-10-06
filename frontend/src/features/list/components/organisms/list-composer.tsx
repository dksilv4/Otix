import { useState, useEffect } from "react"
import { XIcon, Check } from "lucide-react"
import type { UserListOut, UserListCreate } from "../../list-queries"
import { cn } from "@/lib/utils"

export interface ListComposerProps {
  onClose?: () => void
  onSave: (data: UserListCreate) => Promise<void> | void
  initial?: UserListOut | null
  isExiting?: boolean
}

export const ListComposer = ({
  onClose,
  onSave,
  initial,
  isExiting,
}: ListComposerProps) => {
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? false)
  const [animateIn, setAnimateIn] = useState(false)
  const [isSavingLocal, setIsSavingLocal] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)))
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose?.()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  const visible = animateIn && !isExiting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setIsSavingLocal(true)
    setErrorMessage(null)
    try {
      await onSave({ name: name.trim(), description: description.trim() || null, isPublic })
      onClose?.()
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.detail ||
        err?.response?.data?.name?.[0] ||
        err?.message ||
        "Failed to save list"
      )
    } finally {
      setIsSavingLocal(false)
    }
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[var(--dk-z-modal)] flex items-center justify-center p-4 transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className={cn(
          "relative w-full max-w-lg overflow-hidden rounded-3xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-dialog)] transition-all duration-200 ease-out flex flex-col",
          visible ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
        )}
      >
        <div className="flex items-center gap-2.5 px-6 py-5 border-b border-white/[0.06] shrink-0">
          <h2 className="text-base font-bold text-white truncate flex-1">
            {initial ? "Edit List" : "New List"}
          </h2>
          <button
            onClick={onClose}
            type="button"
            className="shrink-0 rounded-xl p-1.5 transition-all text-[var(--muted-foreground)] hover:bg-[var(--dk-surface-ghost-hover)] hover:text-[var(--foreground)]"
          >
            <XIcon size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col p-6 space-y-5">
          {errorMessage && (
            <div className="rounded-xl bg-destructive/15 border border-destructive/25 px-4 py-2.5 text-xs text-red-400">
              {errorMessage}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
              placeholder="My list name..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional description..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer group">
            <div className={cn(
              "flex items-center justify-center w-5 h-5 rounded border transition-colors",
              isPublic ? "bg-primary border-primary" : "border-white/20 group-hover:border-white/40"
            )}>
              {isPublic && <Check className="h-3 w-3 text-white" />}
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="hidden"
              />
            </div>
            <span className="text-sm text-white/70 group-hover:text-white transition-colors">
              Make this list public
            </span>
          </label>

          <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-white/[0.04]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSavingLocal}
              className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              {isSavingLocal ? "Saving..." : initial ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
};
