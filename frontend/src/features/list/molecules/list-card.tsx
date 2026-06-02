import { Link } from "@tanstack/react-router"
import { cn } from "@/lib/utils"
import type { UserListOut } from "../list-queries"

interface ListCardProps {
 list: UserListOut
}

export function ListCard({ list }: ListCardProps) {
 return (
 <Link
 to="/list/$listId"
 params={{ listId: list.id }}
 className={cn(
 "block rounded-3xl bg-[var(--dk-surface-base)] p-5",
 "hover:bg-[var(--dk-surface-glass)] transition-colors duration-150"
 )}
 >
 <h3 className="font-semibold text-foreground truncate">{list.name}</h3>
 {list.description && (
 <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
 {list.description}
 </p>
 )}
 <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
 {list.isPublic ? (
 <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
 Public
 </span>
 ) : (
 <span className="inline-flex items-center rounded-full bg-muted-foreground/10 px-2 py-0.5">
 Private
 </span>
 )}
 </div>
 </Link>
 )
}
