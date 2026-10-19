import { Sparkles, Compass } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { ActivityModuleSection } from './activity-module-section'

interface ActivityModuleEmptyProps {
  onClose?: () => void
}

/** Ambient empty state rendered when there are no active tasks, media playback, or downloads. */
export const ActivityModuleEmpty = ({ onClose }: ActivityModuleEmptyProps) => {
  return (
    <ActivityModuleSection className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="relative mb-3 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl scale-150" />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-muted shadow-inner">
          <Sparkles className="h-6 w-6 text-primary/70 animate-pulse" />
        </div>
      </div>

      <h3 className="text-sm font-semibold text-foreground">All Quiet</h3>
      <p className="mt-1 text-xs text-muted-foreground max-w-[220px] leading-relaxed">
        Active games, music playback, download queues, and Plex streams will appear here.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <Link
          to="/"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-foreground bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
        >
          <Compass className="h-3.5 w-3.5 text-primary" />
          <span>Discover</span>
        </Link>
      </div>
    </ActivityModuleSection>
  )
};
