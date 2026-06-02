import { useState, useRef, useEffect } from "react"
import { ListIcon, PlusIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/features/auth/auth-provider"
import {
 useUserLists,
 useAddToList,
 useCreateList,
} from "../list-queries"
import { ListComposer } from "../organisms/list-composer"

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
 <div ref={ref} className={cn("relative", className)}>
 <button
 onClick={() => setOpen(!open)}
 className={cn(
 "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium",
 "bg-[var(--dk-surface-base)]",
 "text-foreground hover:bg-[var(--dk-surface-glass)] transition-colors"
 )}
 >
 <ListIcon className="h-4 w-4" />
 Add to List
 </button>

 {open && (
 <div
 className={cn(
 "absolute right-0 top-full mt-2 w-56 rounded-2xl z-50",
 "bg-[var(--dk-surface-overlay)] backdrop-blur-xl",
 "shadow-[var(--dk-shadow-glass)]",
 "",
 "py-2"
 )}
 >
 {lists.length === 0 ? (
 <div className="px-4 py-3 text-sm text-muted-foreground">
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
 className={cn(
 "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left",
 "text-foreground hover:bg-[var(--dk-surface-glass)] transition-colors"
 )}
 >
 <span className="truncate flex-1">{list.name}</span>
 </button>
 ))
 )}

 <div className="border-t border-white/[0.06] mt-1 pt-1">
 <button
 onClick={() => {
 setOpen(false)
 setComposerOpen(true)
 }}
 className={cn(
 "w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left",
 "text-muted-foreground hover:text-foreground",
 "hover:bg-[var(--dk-surface-glass)] transition-colors"
 )}
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
