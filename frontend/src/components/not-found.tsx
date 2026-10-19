import { Link } from '@tanstack/react-router'
import { FileQuestion } from 'lucide-react'

export const NotFoundPage = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="text-center space-y-4 max-w-md">
        <FileQuestion size={64} className="mx-auto text-muted-foreground opacity-30" />
        <h1 className="text-4xl font-black text-foreground">404</h1>
        <p className="text-sm text-muted-foreground">This page doesn't exist.</p>
        <Link to="/" className="inline-block mt-4 px-5 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-sm transition-all font-semibold shadow-sm">
          Go Home
        </Link>
      </div>
    </div>
  )
};
