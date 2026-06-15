// TODO: Review this file
import { useState, useRef, useEffect } from "react"
import { ListIcon, PlusIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/providers/auth"
import {
 useUserLists,
 useAddToList,
 useCreateList,
} from "../list-queries"
import { ListComposer } from "../organisms/list-composer"
import "./add-to-list-button.scss"

interface AddToListButtonProps {
 mediaItemId: string
 className?: string
}

export function AddToListButton({ mediaItemId, className }: AddToListButtonProps) {
 const { isAuthenticated } = useAuth()
 const { data: lists } = useUserLists()
 const addToList = useAddToList()
 const createList = useCreateList()

 const [open, setOpen] = useState(false)
 const [composerOpen, setComposerOpen] = useState(false)
 const ref = useRef<HTMLDivElement>(null)

 useEffect(() => {
 function handleClick(e: MouseEvent) {
 if (ref.current && !ref.current.contains(e.target as Node)) {
 setOpen(false)
 }
 }
 if (open) {
 document.addEventListener("mousedown", handleClick)
 return () => document.removeEventListener("mousedown", handleClick)
 }
 }, [open])

 if (!isAuthenticated || !lists) return null

 return (
 <div ref={ref} className={cn("dk-list__add-to-list", className)}>
 <button
 onClick={() => setOpen(!open)}
 className="dk-list__add-to-list__trigger"
 >
 <ListIcon className="h-4 w-4" />
 Add to List
 </button>

 {open && (
 <div
 className="dk-list__add-to-list__dropdown"
 >
 {lists.length === 0 ? (
 <div className="dk-list__add-to-list__empty">
 No lists yet. Create one first.
 </div>
 ) : (
 lists.map((list) => (
 <button
 key={list.id}
 onClick={() => {
 addToList.mutate(
 { listId: list.id, mediaItemId },
 { onSuccess: () => setOpen(false) }
 )
 }}
 className="dk-list__add-to-list__option"
 >
 <span className="truncate flex-1">{list.name}</span>
 </button>
 ))
 )}

 <div className="dk-list__add-to-list__divider">
 <button
 onClick={() => {
 setOpen(false)
 setComposerOpen(true)
 }}
 className="dk-list__add-to-list__create"
 >
 <PlusIcon className="h-4 w-4" />
 New List
 </button>
 </div>
 </div>
 )}

 <ListComposer
 open={composerOpen}
 onClose={() => setComposerOpen(false)}
 onSave={(data) => {
 createList.mutate(data, { onSuccess: () => setComposerOpen(false) })
 }}
 isSaving={createList.isPending}
 />
 </div>
 )
}
