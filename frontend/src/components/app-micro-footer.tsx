import { useNavigate } from '@tanstack/react-router'
import { Logo } from '@ui/atoms/logo'

export const AppMicroFooter = () => {
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()

  const handleNav = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    navigate({ to: path })
  }

  return (
    <footer
      id="app-micro-footer"
      className="w-full mt-16 pb-8 px-4"
      role="contentinfo"
      aria-label="Site footer"
    >
      <div
        className="mx-auto w-fit rounded-[var(--dk-radius-full)] px-5 py-2.5 flex items-center gap-3 text-xs backdrop-blur-[16px] shadow-[var(--dk-shadow-glass)]"
        style={{
          background: 'oklch(from var(--dk-surface-raised) l c h / 0.25)',
          backgroundImage:
            'linear-gradient(to bottom right, var(--dk-surface-glass), var(--dk-surface-glass-hover))',
        }}
      >
        <a
          href="/"
          onClick={handleNav('/')}
          className="flex items-center gap-1.5 text-foreground/80 hover:text-foreground transition-colors shrink-0"
          title="Otix Home"
        >
          <Logo className="h-3.5 text-foreground" />
          <span className="font-semibold text-foreground">Otix</span>
        </a>

        <span className="text-muted-foreground/30">·</span>
        <span className="text-muted-foreground">© {currentYear}</span>

        <span className="text-muted-foreground/30">·</span>
        <a href="/downloads" onClick={handleNav('/downloads')} className="text-muted-foreground hover:text-foreground transition-colors">Downloads</a>

        <span className="text-muted-foreground/30">·</span>
        <a href="/settings/release-notes" onClick={handleNav('/settings/release-notes')} className="text-muted-foreground hover:text-foreground transition-colors">Release Notes</a>

        <span className="text-muted-foreground/30">·</span>
        <a href="/docs" onClick={handleNav('/docs')} className="text-muted-foreground hover:text-foreground transition-colors">Docs</a>

        <span className="text-muted-foreground/30">·</span>
        <a href="/terms" onClick={handleNav('/terms')} className="text-muted-foreground hover:text-foreground transition-colors">Terms</a>

        <span className="text-muted-foreground/30">·</span>
        <a href="/privacy" onClick={handleNav('/privacy')} className="text-muted-foreground hover:text-foreground transition-colors">Privacy</a>

        <span className="text-muted-foreground/30">·</span>
        <a
          href="https://github.com/dksilv4/Otix"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          title="View on GitHub"
        >
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
        </a>
      </div>
    </footer>
  )
};
