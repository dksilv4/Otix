import { Outlet } from "@tanstack/react-router"
import { FloatingGameSelector } from "@/features/launcher/components/molecules/launcher-floating-game-selector"

export const ClassicLauncherView = () => {
  return (
    <div className="w-full h-full relative font-sans select-none">
      <FloatingGameSelector />
      <Outlet />
    </div>
  )
};
