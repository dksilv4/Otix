interface AuthOrbsProps {
  className?: string
}

export function AuthOrbs({ className }: AuthOrbsProps) {
  return (
    <div className={className} aria-hidden="true">
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(139, 92, 246, 0.3), transparent), radial-gradient(ellipse 60% 50% at 100% 50%, rgba(59, 130, 246, 0.2), transparent), radial-gradient(ellipse 50% 50% at 0% 100%, rgba(236, 72, 153, 0.2), transparent), radial-gradient(ellipse 80% 60% at 50% 120%, rgba(139, 92, 246, 0.25), transparent), hsl(var(--background))',
        }}
      />
      {/* Floating orbs */}
      <div
        className="pointer-events-none fixed left-[10%] top-[15%] rounded-full opacity-60 blur-[80px]"
        style={{
          width: 400,
          height: 400,
          background: 'var(--primary)',
          animation: 'orbFloat 25s ease-in-out infinite',
        }}
      />
      <div
        className="pointer-events-none fixed right-[10%] top-[45%] rounded-full opacity-60 blur-[80px]"
        style={{
          width: 300,
          height: 300,
          background: 'var(--destructive)',
          animation: 'orbFloat 20s ease-in-out -5s infinite',
        }}
      />
      <div
        className="pointer-events-none fixed bottom-[15%] left-[20%] rounded-full opacity-60 blur-[80px]"
        style={{
          width: 350,
          height: 350,
          background: 'oklch(0.546 0.245 262.881)',
          animation: 'orbFloat 22s ease-in-out -10s infinite',
        }}
      />
      <div
        className="pointer-events-none fixed right-[15%] top-[10%] rounded-full opacity-50 blur-[80px]"
        style={{
          width: 250,
          height: 250,
          background: 'var(--primary)',
          animation: 'orbFloat 18s ease-in-out -15s infinite',
        }}
      />
    </div>
  )
}
