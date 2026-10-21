import { Link } from '@tanstack/react-router'
import { ChevronRight, Menu, ExternalLink } from 'lucide-react'
import type { DocArticle, DocCategory } from '../../types'

interface DocsHeaderProps {
  currentCategory: DocCategory
  currentArticle: DocArticle
  onToggleMobileDrawer: () => void
}

export const DocsHeader = ({
  currentCategory,
  currentArticle,
  onToggleMobileDrawer,
}: DocsHeaderProps) => {
  return (
    <div className="flex items-center justify-between gap-4 pb-6 mb-6 border-b border-[var(--dk-separator)]">
      {/* Mobile Drawer Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMobileDrawer}
          className="lg:hidden p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]"
          aria-label="Toggle documentation navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <nav
          aria-label="Breadcrumbs"
          className="flex items-center gap-1.5 sm:gap-2 text-xs text-muted-foreground"
        >
          <Link to="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <ChevronRight className="h-3 w-3 opacity-40 shrink-0" />
          <span className="text-muted-foreground/80 hidden sm:inline">Docs</span>
          <ChevronRight className="h-3 w-3 opacity-40 shrink-0 hidden sm:inline" />
          <span className="text-muted-foreground/80">{currentCategory.title}</span>
          <ChevronRight className="h-3 w-3 opacity-40 shrink-0" />
          <span className="text-foreground font-semibold truncate max-w-[140px] sm:max-w-none">
            {currentArticle.shortTitle || currentArticle.title}
          </span>
        </nav>
      </div>

      {/* External Repository Links */}
      <div className="flex items-center gap-3 text-xs shrink-0">
        <a
          href="https://github.com/dksilv4/Otix"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors"
        >
          <span>GitHub</span>
          <ExternalLink className="h-3 w-3 opacity-60" />
        </a>
        <a
          href="https://github.com/dksilv4/Otix/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors"
        >
          <span>Releases</span>
          <ExternalLink className="h-3 w-3 opacity-60" />
        </a>
      </div>
    </div>
  )
}
