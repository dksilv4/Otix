import { useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

export function OAuthButton({
  icon,
  ariaLabel,
  gradient,
  onClick,
}: {
  icon: ReactNode
  ariaLabel: string
  gradient: { from: string; to: string }
  onClick: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      await onClick()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full backdrop-blur-lg transition-all hover:scale-105 disabled:opacity-50"
      aria-label={ariaLabel}
      style={{ background: `linear-gradient(135deg, ${gradient.from} 0%, ${gradient.to} 100%)` }}
    >
      <div
        className="absolute inset-0 opacity-0 transition-opacity hover:opacity-100"
        style={{ background: `linear-gradient(135deg, ${gradient.from} 0%, ${gradient.to} 100%)`, filter: 'brightness(1.2)' }}
      />
      {loading ? (
        <Loader2 className="relative z-10 h-5 w-5 animate-spin" />
      ) : (
        <span className="relative z-10">{icon}</span>
      )}
    </button>
  )
}
