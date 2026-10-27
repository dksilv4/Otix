import { useUserLists, ListCard } from "@list"
import { Carousel } from "@ui/molecules/carousel"

export const ListsPreviewSection = () => {
  const { data: lists, isLoading } = useUserLists()

  const listItems = Array.isArray(lists) ? lists.filter(Boolean) : []

  if (isLoading || listItems.length === 0) return null

  return (
    <div className="space-y-4">
      <Carousel
        title="Custom Lists"
        subtitle="Curated collections created by you"
        viewAllLink="/library/lists"
        minItemWidth={280}
        gap={16}
        showArrows
      >
        {listItems.map((list) => (
          <div key={list.id} className="min-w-[280px]">
            <ListCard list={list} />
          </div>
        ))}
      </Carousel>
    </div>
  )
}
