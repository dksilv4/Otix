import { useEffect, useState, type ReactNode } from 'react'

interface SlidePanelProps {
  children: ReactNode
  onClose: () => void
  isExiting?: boolean
  /** Width of the nav sidebar to clear. Default 17rem. */
  navOffset?: string
}

export const SlidePanel = ({ children, onClose, isExiting, navOffset = '17rem' }: SlidePanelProps) => {
  const [animateIn, setAnimateIn] = useState(false)
  const visible = animateIn && !isExiting

  useEffect(() => {
    requestAnimationFrame(() => setAnimateIn(true))
  }, [])

  return (
    <div
      className="fixed inset-0 flex justify-end transition-opacity duration-200 z-50"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onClose}
      />

      {/* Spacer to clear nav */}
      <div className="shrink-0" style={{ width: navOffset }} />

      {/* Panel */}
      <div
        className="w-full max-w-md my-8 mr-8 flex flex-col bg-white/5 backdrop-blur-xl rounded-3xl shadow-[var(--dk-shadow-glass)] overflow-hidden transition-all duration-300 ease-out"
        style={{
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {children}
      </div>
    </div>
  )
};
