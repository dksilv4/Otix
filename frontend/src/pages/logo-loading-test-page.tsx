import { Logo } from '@ui/atoms/logo'

/** Dev-only preview for the animated Otix loading mark. */
export const LogoLoadingTestPage = () => {
  return (
    <div className="fixed inset-0 flex items-center justify-center gap-10 sm:gap-16 bg-background">
      <div className="flex flex-col items-center gap-3">
        <Logo
          className="h-24 sm:h-28 drop-shadow-[0_0_32px_color-mix(in_oklch,var(--primary)_35%,transparent)]"
          animateInfinity
        />
        <span className="text-xs font-medium text-muted-foreground tracking-wide">Animated</span>
      </div>
      <div className="flex flex-col items-center gap-3">
        <Logo
          className="h-24 sm:h-28 drop-shadow-[0_0_32px_color-mix(in_oklch,var(--primary)_35%,transparent)]"
          animateInfinity={false}
        />
        <span className="text-xs font-medium text-muted-foreground tracking-wide">Static</span>
      </div>
    </div>
  )
};
