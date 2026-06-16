import { PersonCard } from '@person/molecules/person-card'

interface CreditItem {
  id: string
  person: { id: string; name: string; photoUrl?: string } | null
  role: string
  characterName?: string
  sortOrder: number
}

export function CreditRow({ label, items }: { label: string; items: CreditItem[] }) {
  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </h4>

      <div
        className="flex gap-3 overflow-x-auto overscroll-x-contain scroll-smooth scrollbar-none pb-2"
        aria-label={`${label} credits`}
      >
        {items.map((c) => (
          c.person ? (
            <PersonCard
              key={c.id}
              id={c.person.id}
              name={c.person.name}
              imageUrl={c.person.photoUrl}
              role={c.characterName || c.role}
            />
          ) : null
        ))}
      </div>
    </div>
  )
}
