import type { DocSubheading } from '../../types'
import { AlignLeft } from 'lucide-react'

interface DocsTocProps {
  subheadings: DocSubheading[]
  activeHeadingId: string
  onScrollToHeading: (id: string) => void
}

export const DocsToc = ({
  subheadings,
  activeHeadingId,
  onScrollToHeading,
}: DocsTocProps) => {
  if (!subheadings || subheadings.length === 0) {
    return null
  }

  return (
    <aside
      aria-label="Table of contents"
      className="hidden xl:block w-56 shrink-0 sticky top-24 self-start space-y-3"
    >
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 px-2">
        <AlignLeft className="h-3.5 w-3.5 text-primary" />
        <span>On this page</span>
      </div>
      <div className="flex flex-col gap-0.5 border-l border-[var(--dk-separator)] pl-3 text-xs">
        {subheadings.map((item) => {
          const isActive = activeHeadingId === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onScrollToHeading(item.id)}
              className={`text-left py-1.5 transition-colors line-clamp-1 ${
                isActive
                  ? 'text-primary font-semibold -ml-3 pl-3 border-l-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.title}
            </button>
          )
        })}
      </div>
    </aside>
  )
}
