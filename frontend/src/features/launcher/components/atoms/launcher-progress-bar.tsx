interface LauncherProgressBarProps {
  progress: number // 0-100
}

export function LauncherProgressBar({ progress }: LauncherProgressBarProps) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 h-0.5 bg-white/5">
      <div
        className="h-full bg-[var(--color-accent)] transition-[width]"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
