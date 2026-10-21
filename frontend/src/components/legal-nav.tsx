import { Link } from '@tanstack/react-router'
import { ChevronRight, FileText, ShieldCheck } from 'lucide-react'

export interface LegalNavProps {
  activeTab: 'terms' | 'privacy'
}

export const LegalNav = ({ activeTab }: LegalNavProps) => {
  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground transition-colors">
          Home
        </Link>
        <ChevronRight className="h-3 w-3 opacity-40" />
        <span className="text-muted-foreground">Legal</span>
        <ChevronRight className="h-3 w-3 opacity-40" />
        <span className="text-foreground font-medium">
          {activeTab === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
        </span>
      </nav>

      {/* Legal Document Switcher Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--dk-surface-ghost)] backdrop-blur-xl w-fit">
        <Link
          to="/terms"
          className={
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ' +
            (activeTab === 'terms'
              ? 'bg-[var(--dk-surface-base)] text-foreground shadow-[var(--dk-shadow-xs)]'
              : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]')
          }
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Terms of Service</span>
        </Link>

        <Link
          to="/privacy"
          className={
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ' +
            (activeTab === 'privacy'
              ? 'bg-[var(--dk-surface-base)] text-foreground shadow-[var(--dk-shadow-xs)]'
              : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]')
          }
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Privacy Policy</span>
        </Link>
      </div>
    </div>
  )
};
