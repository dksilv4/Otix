import type {
  DocArticle,
  DocCategory,
  DocSectionId,
} from '../../types'
import { DocsCallout } from '../atoms/docs-callout'
import { DocsCodeBlock } from '../atoms/docs-code-block'
import { DocsPagination } from '../molecules/docs-pagination'
import { DkButton } from '@ui/atoms/button'
import { Wand2 } from 'lucide-react'

interface DocsArticleViewProps {
  article: DocArticle
  category: DocCategory
  adjacent: {
    prev: { article: DocArticle; category: DocCategory } | null
    next: { article: DocArticle; category: DocCategory } | null
  }
  onSelectSection: (id: DocSectionId) => void
  onCopyCode: (code: string, label?: string) => void
  onLaunchSetupWizard?: () => void
}

export const DocsArticleView = ({
  article,
  category,
  adjacent,
  onSelectSection,
  onCopyCode,
  onLaunchSetupWizard,
}: DocsArticleViewProps) => {
  return (
    <article
      id="docs-active-article"
      className="max-w-4xl w-full mx-auto space-y-8"
      aria-label={article.title}
    >
      {/* Header Block */}
      <header className="space-y-3 pb-6">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wider uppercase text-primary">
            {category.title}
          </span>
          {article.badge && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
              {article.badge}
            </span>
          )}
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          {article.title}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          {article.tagline}
        </p>
      </header>

      {/* Main Content Blocks */}
      <div className="space-y-6 text-sm text-foreground">
        {article.blocks.map((block, idx) => {
          if (block.type === 'subheading' && block.subheading) {
            return (
              <h2
                key={`subhead-${block.subheading.id}-${idx}`}
                id={block.subheading.id}
                className="text-xl sm:text-2xl font-bold tracking-tight text-foreground pt-6 pb-2 scroll-mt-24"
              >
                {block.subheading.title}
              </h2>
            )
          }

          if (block.type === 'paragraph' && block.text) {
            return (
              <p
                key={`p-${idx}`}
                className="text-sm sm:text-base leading-relaxed text-muted-foreground"
              >
                {block.text}
              </p>
            )
          }

          if (block.type === 'callout' && block.callout) {
            return (
              <DocsCallout
                key={`callout-${idx}`}
                kind={block.callout.kind}
                title={block.callout.title}
                text={block.callout.text}
              />
            )
          }

          if (block.type === 'code' && block.code) {
            return (
              <DocsCodeBlock
                key={`code-${idx}`}
                snippet={block.code}
                onCopy={onCopyCode}
              />
            )
          }

          if (block.type === 'bullet-list' && block.items) {
            return (
              <ul
                key={`list-${idx}`}
                className="space-y-2.5 pl-5 list-disc text-muted-foreground leading-relaxed text-sm"
              >
                {block.items.map((item, itemIdx) => (
                  <li key={`item-${itemIdx}`}>{item}</li>
                ))}
              </ul>
            )
          }

          if (block.type === 'steps' && block.steps) {
            return (
              <div key={`steps-${idx}`} className="space-y-4 my-6">
                {block.steps.map((step) => (
                  <div
                    key={`step-${step.step}`}
                    className="p-4 sm:p-5 rounded-2xl border border-white/[0.05] bg-[var(--dk-surface-base)] space-y-2 shadow-[var(--dk-shadow-xs)]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold bg-primary text-primary-foreground shrink-0">
                        {step.step}
                      </span>
                      <h3 className="font-semibold text-sm sm:text-base text-foreground">
                        {step.title}
                      </h3>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground pl-9 leading-relaxed">
                      {step.description}
                    </p>
                    {step.code && (
                      <div className="pl-9 pt-2">
                        <DocsCodeBlock
                          snippet={step.code}
                          onCopy={onCopyCode}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          }

          if (block.type === 'table' && block.table) {
            return (
              <div
                key={`table-${idx}`}
                className="overflow-x-auto rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-xs)] my-4"
              >
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-[var(--dk-surface-ghost)] text-foreground font-semibold">
                    <tr>
                      {block.table.headers.map((header, hIdx) => (
                        <th key={`th-${hIdx}`} className="p-3 sm:p-4">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    {block.table.rows.map((row, rIdx) => (
                      <tr
                        key={`tr-${rIdx}`}
                        className="hover:bg-[var(--dk-surface-ghost)] transition-colors"
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={`td-${cIdx}`}
                            className={`p-3 sm:p-4 ${
                              cIdx === 0 ? 'font-medium text-foreground' : ''
                            }`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }

          if (block.type === 'action-button' && block.action) {
            return (
              <div key={`action-${idx}`} className="pt-2">
                <DkButton
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => {
                    if (block.action?.type === 'setup-wizard') {
                      onLaunchSetupWizard?.()
                    }
                  }}
                  className="rounded-xl px-5 gap-2 text-xs sm:text-sm font-semibold"
                >
                  <Wand2 className="h-4 w-4" />
                  <span>{block.action.label}</span>
                </DkButton>
              </div>
            )
          }

          return null
        })}
      </div>

      {/* Pagination Footer */}
      <DocsPagination
        prev={adjacent.prev}
        next={adjacent.next}
        onSelectSection={onSelectSection}
      />
    </article>
  )
}
