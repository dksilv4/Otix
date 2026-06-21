/** Animated gradient background canvas for auth pages. (atom) */
export const AuthBackground = () => (
  <div
    className="fixed inset-0 overflow-hidden"
    style={{ backgroundColor: 'var(--dk-surface-root)' }}
  >
    <div
      className="absolute inset-[-100%]"
      style={{
        backgroundImage: `
          radial-gradient(ellipse 45% 45% at 15% 50%, color-mix(in oklch, var(--primary) 12%, transparent), transparent),
          radial-gradient(ellipse 35% 35% at 80% 30%, color-mix(in oklch, var(--accent) 8%, transparent), transparent),
          radial-gradient(ellipse 30% 30% at 50% 80%, color-mix(in oklch, var(--foreground) 3%, transparent), transparent)
        `,
        animation: 'authBgShift 30s ease-in-out infinite',
      }}
    />
  </div>
)
