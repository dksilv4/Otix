import { useNavigate } from '@tanstack/react-router'
import { Search, Sparkles, Film, Gamepad2, Download, Trophy, Command } from 'lucide-react'
import { openCommandPalette } from '@/features/hub'
import { openDecideWatch } from '@/features/discover/open-decide-watch'

export const WelcomeCommandPaletteBar = () => {
  const navigate = useNavigate()

  const handleOpenSearch = () => {
    openCommandPalette()
  }

  const handleDecide = (e: React.MouseEvent) => {
    e.stopPropagation()
    openDecideWatch()
  }

  const handleNavigate = (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    void navigate({ to: path })
  }

  return (
    <div className="relative overflow-hidden rounded-[2.5rem] glass-card p-6 sm:p-8 shadow-[var(--dk-shadow-glass)] space-y-5">
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full glass-inset px-3 py-1 text-xs font-semibold text-primary">
            <Command className="h-3.5 w-3.5" />
            <span>Command Palette & Quick Launcher</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Instant Access from Anywhere
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            Otix is keyboard-driven. Use the global command palette at any moment to jump between libraries, launch installed games, pick something to watch, or trigger tools.
          </p>
        </div>

        {/* Shortcut pill */}
        <div className="hidden sm:flex items-center gap-2 self-start md:self-auto glass-inset px-4 py-2 rounded-2xl">
          <span className="text-xs text-muted-foreground font-medium">Global Shortcut</span>
          <kbd className="rounded-lg bg-[var(--dk-surface-overlay)] px-2.5 py-1 font-mono text-xs font-bold text-primary shadow-inner">
            ⌘K / Ctrl+K
          </kbd>
        </div>
      </div>

      {/* Interactive Command Bar */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleOpenSearch}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleOpenSearch()
          }
        }}
        className="group relative z-10 flex w-full cursor-pointer items-center justify-between rounded-2xl glass-inset px-5 py-4 transition-all duration-200 hover:bg-[var(--dk-surface-ghost-hover)] shadow-inner"
      >
        <div className="flex items-center gap-3.5 text-muted-foreground transition-colors group-hover:text-foreground">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Search className="h-4.5 w-4.5" />
          </div>
          <span className="text-sm font-medium">
            Search titles, jump to pages, or run quick actions...
          </span>
        </div>

        <div className="flex items-center gap-2">
          <kbd className="hidden sm:inline-flex items-center rounded-lg bg-[var(--dk-surface-overlay)] px-2.5 py-1 font-mono text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors shadow-inner">
            ⌘K
          </kbd>
          <span className="rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm">
            Open
          </span>
        </div>
      </div>

      {/* Balanced Quick Action Chips */}
      <div className="relative z-10 flex flex-wrap items-center gap-2 pt-0.5">
        <span className="text-xs text-muted-foreground mr-1">
          Quick actions:
        </span>

        <button
          type="button"
          onClick={handleDecide}
          className="inline-flex items-center gap-2 rounded-xl glass-inset px-3 py-1.5 text-xs font-medium text-foreground/90 hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-all cursor-pointer active:scale-95"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Decide for me</span>
        </button>

        <button
          type="button"
          onClick={(e) => handleNavigate(e, '/genres?type=movie')}
          className="inline-flex items-center gap-2 rounded-xl glass-inset px-3 py-1.5 text-xs font-medium text-foreground/90 hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-all cursor-pointer active:scale-95"
        >
          <Film className="h-3.5 w-3.5 text-[var(--media-movie)]" />
          <span>Browse Movies</span>
        </button>

        <button
          type="button"
          onClick={(e) => handleNavigate(e, '/launcher')}
          className="inline-flex items-center gap-2 rounded-xl glass-inset px-3 py-1.5 text-xs font-medium text-foreground/90 hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-all cursor-pointer active:scale-95"
        >
          <Gamepad2 className="h-3.5 w-3.5 text-[var(--media-game)]" />
          <span>Game Launcher</span>
        </button>

        <button
          type="button"
          onClick={(e) => handleNavigate(e, '/settings/downloads')}
          className="inline-flex items-center gap-2 rounded-xl glass-inset px-3 py-1.5 text-xs font-medium text-foreground/90 hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-all cursor-pointer active:scale-95"
        >
          <Download className="h-3.5 w-3.5 text-primary" />
          <span>Download Queue</span>
        </button>

        <button
          type="button"
          onClick={(e) => handleNavigate(e, '/settings/profile')}
          className="inline-flex items-center gap-2 rounded-xl glass-inset px-3 py-1.5 text-xs font-medium text-foreground/90 hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-all cursor-pointer active:scale-95"
        >
          <Trophy className="h-3.5 w-3.5 text-[var(--media-music)]" />
          <span>Check XP Level</span>
        </button>
      </div>
    </div>
  )
}
