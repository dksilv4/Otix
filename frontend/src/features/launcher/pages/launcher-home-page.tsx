import { Helmet } from "react-helmet-async"
import { Suspense, useState, useEffect } from "react"
import { QueryErrorBoundary } from "@/components/query-error-boundary"
import { FpsPermissionDialog } from "@/features/launcher/components/molecules/launcher-fps-permission-dialog"
import { LauncherAchievementToast } from "@/features/launcher/components/molecules/launcher-achievement-toast"
import { LauncherPerformanceDiagnosticsModal } from "@/features/launcher/components/organisms/launcher-performance-diagnostics-modal"
import { useHydrateLocalGames } from "@/features/launcher/hooks/use-launcher-hydrate"
import { THEME_VIEWS } from "@/features/launcher/utils/theme-views"
import {
  LauncherThemeProvider,
  useLauncherTheme,
} from "@/features/launcher/themes/theme-context"

const LauncherContent = () => {
  const { currentTheme } = useLauncherTheme()
  const ThemeView = THEME_VIEWS[currentTheme] ?? THEME_VIEWS.classic
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCtrlShiftD =
        (event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === "D" || event.key === "d")
      const isF3 = event.key === "F3"

      if (isCtrlShiftD || isF3) {
        event.preventDefault()
        setDiagnosticsOpen((prev) => !prev)
      }
    }

    const handleOpen = () => setDiagnosticsOpen(true)
    const handleToggle = () => setDiagnosticsOpen((prev) => !prev)

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("otix:open-launcher-diagnostics", handleOpen)
    window.addEventListener("otix:toggle-launcher-diagnostics", handleToggle)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("otix:open-launcher-diagnostics", handleOpen)
      window.removeEventListener("otix:toggle-launcher-diagnostics", handleToggle)
    }
  }, [])

  return (
    <div
      id="launcher-root"
      className="w-full h-screen bg-background text-foreground relative shadow-2xl font-sans select-none overflow-hidden"
    >
      <Helmet>
        <title>Launcher · Otix</title>
      </Helmet>
      <FpsPermissionDialog />
      <LauncherAchievementToast />
      <LauncherPerformanceDiagnosticsModal
        open={diagnosticsOpen}
        onOpenChange={setDiagnosticsOpen}
      />
      <Suspense fallback={<div className="w-full h-full bg-background" aria-hidden />}>
        <ThemeView />
      </Suspense>
    </div>
  )
};

export const LauncherHomePage = () => {
  useHydrateLocalGames()

  return (
    <QueryErrorBoundary label="launcher">
      <LauncherThemeProvider>
        <LauncherContent />
      </LauncherThemeProvider>
    </QueryErrorBoundary>
  )
};
