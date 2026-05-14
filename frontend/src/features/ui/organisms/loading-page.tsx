import { InfinitySpinner } from '@ui/atoms/infinity-spinner'

export function LoadingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <InfinitySpinner className="h-40 w-40 text-foreground" />
    </div>
  )
}
