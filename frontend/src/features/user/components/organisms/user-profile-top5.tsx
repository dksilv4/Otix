import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Crown, Edit3, Star, Plus } from 'lucide-react'
import { userQueries } from '../../user-queries'
import { SectionHeader } from '../molecules/section-header'
import { EditTop5Modal } from '../molecules/edit-top5-modal'
import type { SectionVisibility, Top5Item } from '../../types'

interface UserProfileTop5Props {
  username: string
  isOwner?: boolean
  visibility?: SectionVisibility
  onToggleVisibility?: () => void | Promise<void>
  onChangeVisibility?: (visibility: SectionVisibility) => void | Promise<void>
  isUpdatingVisibility?: boolean
}

export const UserProfileTop5 = ({
  username,
  isOwner = false,
  visibility = 'public',
  onToggleVisibility,
  onChangeVisibility,
  isUpdatingVisibility = false,
}: UserProfileTop5Props) => {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const query = useQuery(userQueries.top5(username))
  const items: Top5Item[] = useMemo(
    () => (Array.isArray(query.data) ? query.data : []),
    [query.data],
  )

  const summary = items.length > 0 ? `${items.length} favorites` : undefined

  return (
    <div data-testid="user-profile-top5" className="w-full space-y-4">
      <SectionHeader
        icon={Crown}
        title="Top 5 Favorites"
        summary={summary}
        isOwner={isOwner}
        visibility={visibility}
        onToggleVisibility={onToggleVisibility}
        onChangeVisibility={onChangeVisibility}
        isUpdatingVisibility={isUpdatingVisibility}
        actions={
          isOwner ? (
            <button
              type="button"
              onClick={() => setIsEditOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-muted-foreground hover:text-foreground bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] transition-colors cursor-pointer border border-[var(--dk-separator)]"
            >
              <Edit3 className="h-3 w-3" />
              <span>Edit</span>
            </button>
          ) : null
        }
      />

      <div className="px-4 sm:px-6 lg:px-8">
        {query.isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="aspect-[2/3] rounded-2xl bg-[var(--dk-surface-ghost)] animate-pulse border border-[var(--dk-separator)]"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)]/40">
            <Crown className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs font-semibold text-muted-foreground">
              No top 5 favorites curated yet
            </p>
            {isOwner && (
              <button
                type="button"
                onClick={() => setIsEditOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 transition-opacity cursor-pointer shadow"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Curate Top 5</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {items.slice(0, 5).map((item, idx) => (
              <div
                key={item.id}
                className="group relative flex flex-col rounded-2xl overflow-hidden bg-[var(--dk-surface-base)] border border-[var(--dk-separator)] hover:scale-[1.02] transition-all duration-200 shadow-sm"
              >
                <div className="relative aspect-[2/3] w-full bg-[var(--dk-surface-ghost)] overflow-hidden">
                  {item.posterUrl ? (
                    <img
                      src={item.posterUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                      <Crown className="h-8 w-8" />
                    </div>
                  )}

                  {/* Rank Badge */}
                  <div className="absolute top-2.5 left-2.5 h-6 w-6 rounded-full flex items-center justify-center text-xs font-extrabold bg-[var(--dk-surface-base)]/90 backdrop-blur-md text-foreground shadow border border-white/10">
                    {idx + 1}
                  </div>

                  {item.score != null && (
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--dk-surface-base)]/90 backdrop-blur-md text-primary font-bold text-[10px] shadow">
                      <Star className="h-2.5 w-2.5 fill-current" />
                      <span>{item.score.toFixed(1)}</span>
                    </div>
                  )}
                </div>

                <div className="p-2.5 min-w-0">
                  <span className="text-xs font-semibold text-foreground truncate block leading-tight">
                    {item.title}
                  </span>
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground capitalize">
                    <span>{item.mediaType}</span>
                    {item.releaseYear && (
                      <>
                        <span className="opacity-40">·</span>
                        <span>{item.releaseYear}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isOwner && (
        <EditTop5Modal
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          currentItems={items}
          username={username}
        />
      )}
    </div>
  )
}
