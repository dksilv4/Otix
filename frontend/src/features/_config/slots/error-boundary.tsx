// frontend/src/features/_config/slots/ErrorBoundary.tsx
import { Component, type ReactNode } from 'react'
import { showErrorToast } from '@ui/molecules/toast'
import type { SlotErrorBoundaryState } from './types'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error) => void
}

export class ErrorBoundary extends Component<Props, SlotErrorBoundaryState> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): SlotErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error): void {
    showErrorToast(error, 'Slot Error')
    this.props.onError?.(error)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback || null
    }
    return this.props.children
  }
}
