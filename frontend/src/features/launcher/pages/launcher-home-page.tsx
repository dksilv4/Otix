import { Helmet } from "react-helmet-async"
import { QueryErrorBoundary } from "@/components/query-error-boundary"
import { FpsPermissionDialog } from "@/features/launcher/components/molecules/launcher-fps-permission-dialog"
import { useHydrateLocalGames } from "@/features/launcher/hooks/use-launcher-hydrate"
import {
  LauncherThemeProvider,
  useLauncherTheme,
  ClassicLauncherView,
  ModernLauncherView,
  SteamLauncherView,
  PlayStationLauncherView,
  XboxLauncherView,
  SwitchLauncherView,
  RetroLauncherView,
  MinimalLauncherView,
  ForgeLauncherView,
  GlassLauncherView,
} from "@/features/launcher/themes"

function LauncherContent() {
  const { currentTheme } = useLauncherTheme()

  const renderActiveTheme = () => {
    switch (currentTheme) {
      case "classic":
        return <ClassicLauncherView />
      case "steam":
        return <SteamLauncherView />
      case "playstation":
        return <PlayStationLauncherView />
      case "xbox":
        return <XboxLauncherView />
      case "switch":
        return <SwitchLauncherView />
      case "retro":
        return <RetroLauncherView />
      case "minimal":
        return <MinimalLauncherView />
      case "forge":
        return <ForgeLauncherView />
      case "glass":
        return <GlassLauncherView />
      case "modern":
      default:
        return <ModernLauncherView />
    }
  }

  return (
    <div
      id="launcher-root"
      className="w-full h-screen bg-[#0a0a0d] text-white relative shadow-[0_24px_50px_rgba(0,0,0,0.85)] font-sans select-none overflow-hidden"
    >
      <Helmet>
        <title>Launcher · Otix</title>
      </Helmet>
      <FpsPermissionDialog />

      {/* Active Theme View */}
      {renderActiveTheme()}
    </div>
  )
}

export function LauncherHomePage() {
  useHydrateLocalGames()

  return (
    <QueryErrorBoundary label="launcher">
      <LauncherThemeProvider>
        <LauncherContent />
      </LauncherThemeProvider>
    </QueryErrorBoundary>
  )
}
