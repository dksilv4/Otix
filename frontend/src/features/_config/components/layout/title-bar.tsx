import { useEffect, useState, useCallback } from 'react'
import { useDesktopPlatform } from '@/lib/desktop/platform'
import { cn } from '@/lib/utils'
import { Minus, Square, Maximize2, X, Tv } from 'lucide-react'
import './title-bar.scss'

interface PlayerTheaterSyncState {
  isOpen: boolean
  isTheater: boolean
  controlsVisible: boolean
}

interface MacOSTitleBarProps {
  playerState?: PlayerTheaterSyncState
}

const MacOSTitleBar = ({ playerState }: MacOSTitleBarProps) => {
  const handleExitTheater = useCallback(() => {
    window.dispatchEvent(new CustomEvent('otix:exit-theater'))
  }, [])

  return (
    <div className="dk-title-bar dk-title-bar--macos">
      <span className="dk-title-bar__app-title">
        Otix
      </span>

      {playerState?.isOpen && playerState?.isTheater && (
        <div
          className={cn(
            'absolute right-3 top-0 h-full flex items-center transition-opacity duration-300 pointer-events-auto',
            !playerState.controlsVisible ? 'opacity-0 pointer-events-none' : 'opacity-100',
          )}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onMouseMove={() => window.dispatchEvent(new CustomEvent('otix:player-show-controls'))}
        >
          <button
            type="button"
            onClick={handleExitTheater}
            className={cn('dk-title-bar__button', 'dk-title-bar__button--win')}
            aria-label="Exit theater mode (T)"
            title="Exit theater mode (T)"
          >
            <Tv className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

interface WindowsLinuxTitleBarProps {
  playerState?: PlayerTheaterSyncState
}

const WindowsLinuxTitleBar = ({ playerState }: WindowsLinuxTitleBarProps) => {
  const [isMaximized, setIsMaximized] = useState(false)
  const api = window.desktopAPI as unknown as {
    isWindowMaximized: () => Promise<boolean>
    onMaximizedChanged: (cb: (maximized: boolean) => void) => () => void
    minimizeWindow: () => Promise<void>
    maximizeWindow: () => Promise<void>
    unmaximizeWindow: () => Promise<void>
    closeWindow: () => Promise<void>
  } | undefined

  useEffect(() => {
    if (!api) return
    api.isWindowMaximized().then(setIsMaximized).catch(() => {})
    const unsub = api.onMaximizedChanged((maximized) => {
      setIsMaximized(maximized)
    })
    return unsub
  }, [api])

  const handleMaximizeRestore = useCallback(() => {
    if (!api) return
    if (isMaximized) {
      api.unmaximizeWindow()
    } else {
      api.maximizeWindow()
    }
  }, [api, isMaximized])

  const handleExitTheater = useCallback(() => {
    window.dispatchEvent(new CustomEvent('otix:exit-theater'))
  }, [])

  const handleTitleBarMouseMove = useCallback(() => {
    if (playerState?.isOpen) {
      window.dispatchEvent(new CustomEvent('otix:player-show-controls'))
    }
  }, [playerState?.isOpen])

  const isTheaterActive = Boolean(playerState?.isOpen && playerState?.isTheater)
  const shouldHideControls = isTheaterActive && !playerState?.controlsVisible

  return (
    <div className="dk-title-bar">
      {/* Left: drag region (no menu — the floating pill has it) */}
      <div className="dk-title-bar__drag-region dk-title-bar__drag-region--left" />

      {/* Right: window controls (auto-hides in theater mode when UI hides) */}
      <div
        className={cn(
          'dk-title-bar__controls transition-opacity duration-300',
          shouldHideControls ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto',
        )}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onMouseMove={handleTitleBarMouseMove}
      >
        {/* Disable theater mode button - sits flush right next to window buttons */}
        {isTheaterActive && (
          <button
            type="button"
            onClick={handleExitTheater}
            className={cn('dk-title-bar__button', 'dk-title-bar__button--win')}
            aria-label="Exit theater mode (T)"
            title="Exit theater mode (T)"
          >
            <Tv className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Minimize */}
        <button
          onClick={() => api?.minimizeWindow()}
          className={cn('dk-title-bar__button', 'dk-title-bar__button--win')}
          aria-label="Minimize"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        {/* Maximize / Restore */}
        <button
          onClick={handleMaximizeRestore}
          className={cn('dk-title-bar__button', 'dk-title-bar__button--win')}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <Maximize2 className="h-3.5 w-3.5" />
          ) : (
            <Square className="h-3 w-3" />
          )}
        </button>

        {/* Close */}
        <button
          onClick={() => api?.closeWindow()}
          className={cn('dk-title-bar__button', 'dk-title-bar__button--win', 'dk-title-bar__button--close')}
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export const TitleBar = () => {
  const { isDesktop, isMac } = useDesktopPlatform()
  const [playerState, setPlayerState] = useState<PlayerTheaterSyncState>({
    isOpen: false,
    isTheater: false,
    controlsVisible: true,
  })

  useEffect(() => {
    const handleSync = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail) {
        setPlayerState({
          isOpen: Boolean(detail.isOpen),
          isTheater: Boolean(detail.isTheater),
          controlsVisible: Boolean(detail.controlsVisible),
        })
      }
    }
    window.addEventListener('otix:player-theater-sync', handleSync)
    return () => window.removeEventListener('otix:player-theater-sync', handleSync)
  }, [])

  if (!isDesktop) {
    if (playerState.isOpen && playerState.isTheater) {
      return (
        <div className="dk-title-bar justify-end pointer-events-none">
          <div
            className={cn(
              'dk-title-bar__controls transition-opacity duration-300 pointer-events-auto',
              !playerState.controlsVisible ? 'opacity-0 pointer-events-none' : 'opacity-100',
            )}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onMouseMove={() => window.dispatchEvent(new CustomEvent('otix:player-show-controls'))}
          >
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('otix:exit-theater'))}
              className={cn('dk-title-bar__button', 'dk-title-bar__button--win')}
              aria-label="Exit theater mode (T)"
              title="Exit theater mode (T)"
            >
              <Tv className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )
    }
    return null
  }

  if (isMac) return <MacOSTitleBar playerState={playerState} />

  return <WindowsLinuxTitleBar playerState={playerState} />
}
