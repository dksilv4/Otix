import type { DocArticle, DocCategory, DocSectionId } from '../../types'
import { ArrowLeft, ArrowRight } from 'lucide-react'

interface DocsPaginationProps {
  prev: { article: DocArticle; category: DocCategory } | null
  next: { article: DocArticle; category: DocCategory } | null
  onSelectSection: (id: DocSectionId) => void
}

export const DocsPagination = ({
  prev,
  next,
  onSelectSection,
}: DocsPaginationProps) => {
  if (!prev && !next) return null

  return (
    <nav
      aria-label="Documentation article pagination"
      className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-10 mt-12 border-t border-[var(--dk-separator)]"
    >
      {prev ? (
        <button
          type="button"
          onClick={() => onSelectSection(prev.article.id)}
          className="group flex flex-col items-start gap-1 p-4 rounded-2xl border border-white/[0.05] bg-[var(--dk-surface-base)] hover:bg-[var(--dk-surface-raised)] transition-all duration-200 text-left shadow-[var(--dk-shadow-xs)]"
        >
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-primary transition-colors">
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            <span>Previous</span>
          </div>
          <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
            {prev.article.title}
          </span>
          <span className="text-[11px] text-muted-foreground/70">
            {prev.category.title}
          </span>
        </button>
      ) : (
        <div />
      )}

      {next ? (
        <button
          type="button"
          onClick={() => onSelectSection(next.article.id)}
          className="group flex flex-col items-end gap-1 p-4 rounded-2xl border border-white/[0.05] bg-[var(--dk-surface-base)] hover:bg-[var(--dk-surface-raised)] transition-all duration-200 text-right shadow-[var(--dk-shadow-xs)]"
        >
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-primary transition-colors">
            <span>Next</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </div>
          <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
            {next.article.title}
          </span>
          <span className="text-[11px] text-muted-foreground/70">
            {next.category.title}
          </span>
        </button>
      ) : (
        <div />
      )}
    </nav>
  )
}
