import { PeopleCard } from '@people/components/molecules/people-card'
import { Carousel } from '@/old-features/dk-ui/molecules/carousel'

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

      <Carousel minItemWidth={128} gap={12} showArrows={false}>
        {items.map((c) => (
          c.person ? (
            <PeopleCard
              key={c.id}
              id={c.person.id}
              name={c.person.name}
              imageUrl={c.person.photoUrl}
              role={c.characterName || c.role}
            />
          ) : null
        ))}
      </Carousel>
    </div>
  )
}
