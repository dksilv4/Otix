import { ArrowLeft } from 'lucide-react'

/** Fixed-position back-navigation button for auth pages. (molecule) */
export function AuthBackButton() {
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1

  if (!canGoBack) return null

  return (
    <div className="fixed left-4 top-4 z-50">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-lg transition-colors hover:bg-white/10"
        aria-label="Go back"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
    </div>
  )
}
