import { Gamepad2 } from 'lucide-react'

export const LauncherEmptyState = () => {
  return (
    <section className="w-full h-full min-w-[100vw] min-h-[100vh] bg-background relative shrink-0 flex items-center justify-center">
      <div className="text-center space-y-4">
        <Gamepad2 size={48} className="mx-auto opacity-30 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Select a game to view details</p>
      </div>
    </section>
  )
};
