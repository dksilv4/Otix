import { DkInfinitySpinner } from '@dk-ui/atoms/infinity-spinner'
import './loading-page.scss'

function DkLoadingPage() {
  return (
    <div className="dk-loading-page">
      <DkInfinitySpinner className="h-36 w-36 text-foreground/80" />
      <p className="dk-loading-page__text">loading…</p>
    </div>
  )
}

export { DkLoadingPage, DkLoadingPage as LoadingPage }
