import { Outlet } from "@tanstack/react-router"
import { FloatingGameSelector } from "@/features/launcher/components/molecules/launcher-floating-game-selector"
import { GameSessionStatusIndicator } from "@/features/launcher/components/atoms/game-session-status-indicator"

export const ClassicLauncherView = () => {
  return (
    <div className="w-full h-full relative font-sans select-none">
      <FloatingGameSelector />
      <div className="fixed top-16 right-4 md:top-4 md:right-[220px] z-40 pointer-events-auto">
        <GameSessionStatusIndicator variant="pill" />
      </div>
      <Outlet />
    </div>
  )
};
