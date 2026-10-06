import { Gamepad2 } from 'lucide-react'

export const LauncherEmptyState = () => {
  return (
    <section className="w-full h-full min-w-[100vw] min-h-[100vh] bg-[#0a0a0d] relative shrink-0 flex items-center justify-center">
      <div className="text-center space-y-4">
        <Gamepad2 size={48} className="mx-auto opacity-30" />
        <p className="text-sm text-white/40">Select a game to view details</p>
      </div>
    </section>
  )
};
