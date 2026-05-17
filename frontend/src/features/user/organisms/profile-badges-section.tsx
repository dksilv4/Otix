import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { BadgeShowcase, type BadgeDef } from '../molecules/badge-showcase'

interface BadgesSectionProps {
  username: string
}

export function BadgesSection({ username }: BadgesSectionProps) {
  const badgesQuery = useQuery({
    queryKey: ['user', username, 'badges'],
    queryFn: async () => {
      const { data } = await apiClient.get<BadgeDef[]>(`/users/${username}/badges`)
      return data
    },
    staleTime: 1000 * 60 * 5,
  })

  if (badgesQuery.isLoading || !badgesQuery.data) return null

  const earned = badgesQuery.data.filter((b) => b.earned).length
  const total = badgesQuery.data.length

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="h-4 w-4 text-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Badges ({earned}/{total})
        </h2>
      </div>
      <BadgeShowcase badges={badgesQuery.data} />
    </section>
  )
}
