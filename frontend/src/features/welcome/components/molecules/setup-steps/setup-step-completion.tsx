import { Trophy, CheckCircle2, Sparkles, Compass, Gamepad2 } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'

export interface SetupStepCompletionProps {
  mode: 'desktop' | 'node' | 'cloud'
  hasNode: boolean
  hasGamePath: boolean
  onFinishDiscover: () => void
  onFinishLauncher: () => void
  isFinishing: boolean
}

export const SetupStepCompletion = ({
  mode,
  hasNode,
  hasGamePath,
  onFinishDiscover,
  onFinishLauncher,
  isFinishing,
}: SetupStepCompletionProps) => {
  return (
    <div className="space-y-6 text-center py-2">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/20 text-primary shadow-inner">
        <Trophy className="h-8 w-8" />
      </div>

      <div className="space-y-2 max-w-md mx-auto">
        <div className="inline-flex items-center gap-1.5 rounded-full glass-inset px-3 py-1 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          <span>+150 XP Welcome Bonus Unlocked</span>
        </div>
        <h3 className="text-2xl font-bold tracking-tight text-foreground">
          You're All Set!
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Your Otix environment is ready. Discover tailored recommendations, launch your library, and track your entertainment in one unified view.
        </p>
      </div>

      {/* Summary Checklist */}
      <div className="rounded-2xl glass-inset p-4 max-w-md mx-auto space-y-2 text-left text-xs">
        <div className="flex items-center gap-2 text-foreground/90">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <span>Mode: <strong className="capitalize text-foreground">{mode}</strong></span>
        </div>
        <div className="flex items-center gap-2 text-foreground/90">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <span>Otix Node: {hasNode ? 'Linked and listening' : 'Standalone mode ready'}</span>
        </div>
        <div className="flex items-center gap-2 text-foreground/90">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <span>Library Scanner: {hasGamePath ? 'Configured' : 'Ready (default folders)'}</span>
        </div>
      </div>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <DkButton
          type="button"
          variant="primary"
          size="md"
          onClick={onFinishDiscover}
          loading={isFinishing}
          leftIcon={Compass}
          className="w-full sm:w-auto px-6 rounded-xl font-semibold"
        >
          Explore Discover
        </DkButton>

        <DkButton
          type="button"
          variant="secondary"
          size="md"
          onClick={onFinishLauncher}
          loading={isFinishing}
          leftIcon={Gamepad2}
          className="w-full sm:w-auto px-6 rounded-xl font-semibold"
        >
          Open Game Launcher
        </DkButton>
      </div>
    </div>
  )
}
