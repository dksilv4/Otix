// TODO: Review this file
import { useState, useEffect } from "react"
import { XIcon } from "lucide-react"
import type { UserListOut, UserListCreate } from "../list-queries"
import "./list-composer.scss"

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
 <div className="dk-list-composer__overlay">
 {/* Backdrop */}
 <div
 className="dk-list-composer__backdrop"
 onClick={onClose}
 />

 {/* Dialog */}
 <div
 className="dk-list-composer__dialog"
 >
 <div className="dk-list-composer__header">
 <h2 className="dk-list-composer__title">
 {initial ? "Edit List" : "New List"}
 </h2>
 <button
 onClick={onClose}
 className="dk-list-composer__close-btn"
 >
 <XIcon className="h-4 w-4" />
 </button>
 </div>

 <form onSubmit={handleSubmit} className="dk-list-composer__form">
 <div>
 <label className="dk-list-composer__label">
 Name
 </label>
 <input
 type="text"
 value={name}
 onChange={(e) => setName(e.target.value)}
 maxLength={200}
 required
 placeholder="My list name..."
 className="dk-list-composer__input"
 />
 </div>

 <div>
 <label className="dk-list-composer__label">
 Description
 </label>
 <textarea
 value={description}
 onChange={(e) => setDescription(e.target.value)}
 rows={3}
 placeholder="Optional description..."
 className="dk-list-composer__textarea"
 />
 </div>

 <label className="dk-list-composer__checkbox-wrap">
 <input
 type="checkbox"
 checked={isPublic}
 onChange={(e) => setIsPublic(e.target.checked)}
 className="dk-list-composer__checkbox"
 />
 <span className="dk-list-composer__checkbox-label">Make this list public</span>
 </label>

 <div className="dk-list-composer__actions">
 <button
 type="button"
 onClick={onClose}
 className="dk-list-composer__btn dk-list-composer__btn--cancel"
 >
 Cancel
 </button>
 <button
 type="submit"
 disabled={!name.trim() || isSaving}
 className="dk-list-composer__btn dk-list-composer__btn--submit"
 >
 {isSaving ? "Saving..." : initial ? "Save" : "Create"}
 </button>
 </div>
 </form>
 </div>
 </div>
 )
}
