import { Link } from '@tanstack/react-router'
import { Image } from '@ui/atoms/image'
import { Badge } from '@ui/atoms/badge'

interface CreditItem {
  id: string
  person: { id: string; name: string; photoUrl?: string } | null
  role: string
  characterName?: string
  sortOrder: number
}

const roleLabel: Record<string, string> = {
  director: 'Director',
  writer: 'Writer',
  producer: 'Producer',
}

export function KeyCrewCard({ credit }: { credit: CreditItem }) {
  return (
    <Link
      to="/person/$personId"
      params={{ personId: credit.person.id }}
      className="flex items-center gap-3 rounded-xl bg-card p-3 hover:bg-card/80 transition-[background-color]"
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-primary/20">
        <Image
          src={credit.person.photoUrl}
          alt={credit.person.name}
          className="h-full w-full"
          fallback={credit.person.name[0]}
        />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate">{credit.person.name}</p>
        <Badge variant="secondary" className="mt-0.5 text-[10px]">
          {roleLabel[credit.role] ?? credit.role}
        </Badge>
      </div>
    </Link>
  )
}
