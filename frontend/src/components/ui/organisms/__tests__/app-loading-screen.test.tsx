import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppLoadingScreen } from '../app-loading-screen'

const mockState = {
  isMounted: true,
  isReady: false,
  isExiting: false,
  statusMessage: 'Starting Otix…',
  progress: {
    percent: 0,
    transferredText: '',
    speedText: '',
  },
  isDownloadingUpdate: false,
}

vi.mock('@/features/updater/hooks/use-app-loading-state', () => ({
  useAppLoadingState: () => mockState,
}))

vi.mock('@ui/atoms/logo', () => ({
  Logo: () => <div data-testid="otix-logo">Logo</div>,
}))

describe('AppLoadingScreen', () => {
  beforeEach(() => {
    mockState.isMounted = true
    mockState.isReady = false
    mockState.isExiting = false
    mockState.statusMessage = 'Starting Otix…'
    mockState.progress = {
      percent: 0,
      transferredText: '',
      speedText: '',
    }
    mockState.isDownloadingUpdate = false
  })

  it('renders loading overlay with status message and logo', () => {
    render(<AppLoadingScreen />)

    const overlay = screen.getByRole('status')
    expect(overlay).toBeInTheDocument()
    expect(screen.getByTestId('otix-logo')).toBeInTheDocument()
    expect(screen.getByText('Starting Otix…')).toBeInTheDocument()
  })

  it('prevents interaction and click events from passing through', () => {
    render(<AppLoadingScreen />)
    const overlay = screen.getByRole('status')

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
    const pointerEvent = new MouseEvent('pointerdown', { bubbles: true, cancelable: true })

    const clickPreventDefault = vi.spyOn(clickEvent, 'preventDefault')
    const clickStopProp = vi.spyOn(clickEvent, 'stopPropagation')

    overlay.dispatchEvent(clickEvent)
    expect(clickPreventDefault).toHaveBeenCalled()
    expect(clickStopProp).toHaveBeenCalled()

    const pointerPreventDefault = vi.spyOn(pointerEvent, 'preventDefault')
    overlay.dispatchEvent(pointerEvent)
    expect(pointerPreventDefault).toHaveBeenCalled()
  })

  it('renders progress bar and metrics when downloading an update', () => {
    mockState.isDownloadingUpdate = true
    mockState.statusMessage = 'Downloading update v1.2.0…'
    mockState.progress = {
      percent: 62,
      transferredText: '42.0 MB / 68.0 MB',
      speedText: '3.5 MB/s',
    }

    render(<AppLoadingScreen />)

    expect(screen.getByText('Downloading update v1.2.0…')).toBeInTheDocument()
    expect(screen.getByText('62%')).toBeInTheDocument()
    expect(screen.getByText('42.0 MB / 68.0 MB')).toBeInTheDocument()
    expect(screen.getByText('3.5 MB/s')).toBeInTheDocument()
  })

  it('returns null when isMounted is false', () => {
    mockState.isMounted = false
    const { container } = render(<AppLoadingScreen />)
    expect(container.firstChild).toBeNull()
  })
})
