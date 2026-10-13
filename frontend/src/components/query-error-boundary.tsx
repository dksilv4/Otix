import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { showErrorToast } from '@ui/molecules/toast'
import { isChunkLoadError, reloadForNewChunk } from '@/lib/utils/chunk-reload'
import './query-error-boundary.scss'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  /** Label for what broke, e.g. "page" or "section" */
  label?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class QueryErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error): void {
    if (isChunkLoadError(error)) {
      reloadForNewChunk()
      return
    }
    showErrorToast(error, 'Query Error')
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (isChunkLoadError(this.state.error)) {
        return (
          <div className="dk-query-error-boundary">
            <RefreshCw className="h-10 w-10 text-muted-foreground/40 mb-4 animate-spin" />
            <h3 className="dk-query-error-boundary__heading">
              Updating application...
            </h3>
            <p className="dk-query-error-boundary__description">
              A newer version of Otix was deployed. Reloading page.
            </p>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.reload()
                }
              }}
              className="dk-query-error-boundary__retry-btn"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reload now
            </button>
          </div>
        )
      }

      if (this.props.fallback) return this.props.fallback

      return (
        <div className="dk-query-error-boundary">
          <AlertTriangle className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <h3 className="dk-query-error-boundary__heading">
            Something went wrong
          </h3>
          <p className="dk-query-error-boundary__description">
            {this.props.label
              ? `Couldn't load this ${this.props.label}.`
              : 'Couldn\'t load this content.'}
            {' '}It might be a temporary issue.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="dk-query-error-boundary__retry-btn"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
