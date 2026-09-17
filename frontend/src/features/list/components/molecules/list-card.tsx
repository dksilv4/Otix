import { Link } from "@tanstack/react-router"
import type { UserListOut } from "../../list-queries"
import "./list-card.scss"

interface ListCardProps {
 list: UserListOut
}

export function ListCard({ list }: ListCardProps) {
 return (
 <Link
 to="/library/$listId"
 params={{ listId: list.id }}
 className="dk-list-card"
 >
 <h3 className="dk-list-card__title">{list.name}</h3>
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
 </div>
 </Link>
 )
}
