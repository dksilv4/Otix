import { DkSwitch } from '@ui/atoms/switch'
import { DkButton } from '@ui/atoms/button'
import { EyeOff, RotateCcw } from 'lucide-react'
import { useWelcomePreferences } from '../../hooks/use-welcome-preferences'

export const WelcomeVisibilityControls = () => {
  const {
    isWelcomeNavVisible,
    isWelcomeBannerVisible,
    setWelcomeNavVisible,
    setWelcomeBannerVisible,
    hideWelcomeCompletely,
    resetWelcome,
  } = useWelcomePreferences()

  const allHidden = !isWelcomeNavVisible && !isWelcomeBannerVisible

  return (
    <div className="relative overflow-hidden rounded-[2.5rem] glass-card p-7 sm:p-9 shadow-[var(--dk-shadow-glass)] space-y-6">
      <div className="relative z-10 space-y-1.5">
        <h2 className="text-base font-bold tracking-tight text-foreground">
          Guide Visibility & Navigation
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Choose where introduction guides and quick links appear. You can return to this
          page at any time via <span className="font-mono text-primary">/welcome</span>, your avatar menu, or Command Palette (<span className="font-mono text-primary">Cmd+K</span>).
        </p>
      </div>

      <div className="relative z-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-2xl glass-inset p-5">
          <div className="space-y-1 pr-4">
            <p className="text-xs font-semibold text-foreground">
              Navigation Menu Shortcut
            </p>
            <p className="text-[11px] text-muted-foreground leading-normal">
              Show "Welcome Guide" in the floating menu dropdown
            </p>
          </div>
          <DkSwitch
            checked={isWelcomeNavVisible}
            onCheckedChange={setWelcomeNavVisible}
            aria-label="Toggle navigation menu shortcut"
          />
        </div>

        <div className="flex items-center justify-between rounded-2xl glass-inset p-5">
          <div className="space-y-1 pr-4">
            <p className="text-xs font-semibold text-foreground">
              Discover Greeting Banner
            </p>
            <p className="text-[11px] text-muted-foreground leading-normal">
              Show the welcome card above the feed on Discover
            </p>
          </div>
          <DkSwitch
            checked={isWelcomeBannerVisible}
            onCheckedChange={setWelcomeBannerVisible}
            aria-label="Toggle Discover greeting banner"
          />
        </div>
      </div>

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-[var(--dk-separator)]">
        <p className="text-[11px] text-muted-foreground">
          {allHidden
            ? 'The welcome guide is currently hidden from navigation and feeds.'
            : 'Turn off these shortcuts once you are familiar with the interface.'}
        </p>

        <div className="flex items-center gap-2">
          {allHidden ? (
            <DkButton
              type="button"
              variant="primary"
              size="md"
              onClick={resetWelcome}
              leftIcon={RotateCcw}
              className="px-5 rounded-xl text-xs font-semibold shadow-[var(--dk-shadow-sm)]"
            >
              Restore Guides
            </DkButton>
          ) : (
            <DkButton
              type="button"
              variant="secondary"
              size="md"
              onClick={hideWelcomeCompletely}
              leftIcon={EyeOff}
              className="px-5 rounded-xl text-xs font-medium"
            >
              Hide Guides Completely
            </DkButton>
          )}
        </div>
      </div>
    </div>
  )
}
