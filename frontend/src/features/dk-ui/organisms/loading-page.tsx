import { DkInfinitySpinner } from '@dk-ui/atoms/infinity-spinner'

function DkLoadingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <DkInfinitySpinner className="h-40 w-40 text-foreground" />
    </div>
  )
}

export { DkLoadingPage, DkLoadingPage as LoadingPage }
