import type { CSSProperties } from 'react'

export const PANEL_WIDTH = 360
export const PANEL_MARGIN = 16

export const GLASS_STYLE: CSSProperties = {
  background: 'color-mix(in oklch, var(--dk-surface-raised) 85%, transparent)',
  border: '1px solid var(--dk-separator)',
  boxShadow: 'var(--dk-shadow-glass)',
  backdropFilter: 'blur(16px)',
}

