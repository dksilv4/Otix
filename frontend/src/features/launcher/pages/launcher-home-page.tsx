import { Helmet } from "react-helmet-async"
import { Suspense, type ComponentType, type LazyExoticComponent } from "react"
import { safeLazy } from "@/lib/utils/chunk-reload"
import { QueryErrorBoundary } from "@/components/query-error-boundary"
import { FpsPermissionDialog } from "@/features/launcher/components/molecules/launcher-fps-permission-dialog"
import { useHydrateLocalGames } from "@/features/launcher/hooks/use-launcher-hydrate"
import {
  LauncherThemeProvider,
  useLauncherTheme,
  type LauncherThemeId,
} from "@/features/launcher/themes/theme-context"

const themeViews: Record<LauncherThemeId, LazyExoticComponent<ComponentType>> = {
  classic: safeLazy(() =>
    import("@/features/launcher/themes/classic/classic-launcher-view").then((m) => ({
      default: m.ClassicLauncherView,
    })),
  ),
  modern: safeLazy(() =>
    import("@/features/launcher/themes/modern/modern-launcher-view").then((m) => ({
      default: m.ModernLauncherView,
    })),
  ),
  steam: safeLazy(() =>
    import("@/features/launcher/themes/steam/steam-launcher-view").then((m) => ({
      default: m.SteamLauncherView,
    })),
  ),
  playstation: safeLazy(() =>
    import("@/features/launcher/themes/playstation/playstation-launcher-view").then((m) => ({
      default: m.PlayStationLauncherView,
    })),
  ),
  xbox: safeLazy(() =>
    import("@/features/launcher/themes/xbox/xbox-launcher-view").then((m) => ({
      default: m.XboxLauncherView,
    })),
  ),
  switch: safeLazy(() =>
    import("@/features/launcher/themes/switch/switch-launcher-view").then((m) => ({
      default: m.SwitchLauncherView,
    })),
  ),
  retro: safeLazy(() =>
    import("@/features/launcher/themes/retro/retro-launcher-view").then((m) => ({
      default: m.RetroLauncherView,
    })),
  ),
  minimal: safeLazy(() =>
    import("@/features/launcher/themes/minimal/minimal-launcher-view").then((m) => ({
      default: m.MinimalLauncherView,
    })),
  ),
  forge: safeLazy(() =>
    import("@/features/launcher/themes/forge/forge-launcher-view").then((m) => ({
      default: m.ForgeLauncherView,
    })),
  ),
  glass: safeLazy(() =>
    import("@/features/launcher/themes/glass/glass-launcher-view").then((m) => ({
      default: m.GlassLauncherView,
    })),
  ),
}

const LauncherContent = () => {
  const { currentTheme } = useLauncherTheme()
  const ThemeView = themeViews[currentTheme] ?? themeViews.modern

  return (
    <div
      id="launcher-root"
      className="w-full h-screen bg-[#0a0a0d] text-white relative shadow-[0_24px_50px_rgba(0,0,0,0.85)] font-sans select-none overflow-hidden"
    >
      <Helmet>
        <title>Launcher · Otix</title>
      </Helmet>
      <FpsPermissionDialog />
      <Suspense fallback={<div className="w-full h-full bg-[#0a0a0d]" aria-hidden />}>
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
