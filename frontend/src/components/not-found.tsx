import { Link } from '@tanstack/react-router'
import { FileQuestion } from 'lucide-react'

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0d] flex items-center justify-center p-8">
      <div className="text-center space-y-4 max-w-md">
        <FileQuestion size={64} className="mx-auto opacity-20" />
        <h1 className="text-4xl font-black text-white/70">404</h1>
        <p className="text-sm text-white/40">This page doesn't exist.</p>
        <Link to="/" className="inline-block mt-4 px-5 py-2.5 bg-white/10 hover:bg-white/15 rounded-xl text-sm text-white/70 transition-all font-semibold">
          Go Home
        </Link>
      </div>
    </div>
  )
}
