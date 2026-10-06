import { useEffect, useState, useCallback } from 'react'
import { useDesktopPlatform } from '@/lib/desktop/platform'
import { cn } from '@/lib/utils'
import { Minus, Square, Maximize2, X } from 'lucide-react'
import './title-bar.scss'

const MacOSTitleBar = () => {
  return (
    <div className="dk-title-bar dk-title-bar--macos">
      <span className="dk-title-bar__app-title">
        Otix
      </span>
    </div>
  )
};

const WindowsLinuxTitleBar = () => {
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

  return (
    <div className="dk-title-bar">
      {/* Left: drag region (no menu — the floating pill has it) */}
      <div className="dk-title-bar__drag-region dk-title-bar__drag-region--left" />

      {/* Right: window controls */}
      <div className="dk-title-bar__controls" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
};

export const TitleBar = () => {
  const { isDesktop, isMac } = useDesktopPlatform()

  if (!isDesktop) return null

  if (isMac) return <MacOSTitleBar />

  return <WindowsLinuxTitleBar />
};
