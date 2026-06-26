import type { LauncherThemeModule } from '../types'

const theme: LauncherThemeModule = {
  default: {
    meta: {
      id: 'light',
      name: 'Light',
      description: 'A clean light launcher with subtle shadows and a static hero.',
      author: 'Otix',
      version: '1.0.0',
      preview: '',
    },
    components: {},
    tokens: {
      '--dk-surface-root': '#ffffff',
      '--dk-surface-base': '#f8f9fa',
      '--dk-surface-raised': '#ffffff',
      '--dk-surface-overlay': '#f1f3f5',
      '--dk-surface-glass': 'rgba(255,255,255,0.7)',
      '--dk-surface-glass-hover': 'rgba(255,255,255,0.85)',
      '--dk-surface-glass-active': 'rgba(255,255,255,0.95)',
      '--dk-surface-ghost': 'transparent',
      '--dk-surface-ghost-hover': 'rgba(0,0,0,0.04)',
      '--dk-surface-ghost-active': 'rgba(0,0,0,0.08)',
      '--dk-surface-field': '#f1f3f5',
      '--dk-surface-elevated': '#ffffff',
      '--dk-separator': 'rgba(0,0,0,0.08)',
      '--dk-border': 'rgba(0,0,0,0.12)',
      '--dk-border-accent': 'var(--primary)',
      '--dk-muted-foreground': '#6c757d',
      '--color-foreground': '#1a1a2e',
      '--color-background': '#ffffff',
      '--color-card': '#ffffff',
      '--color-card-foreground': '#1a1a2e',
      '--dk-shadow-glass': '0 1px 3px rgba(0,0,0,0.08)',
      '--dk-shadow-dialog': '0 8px 30px rgba(0,0,0,0.12)',
    },
    layout: {
      navPosition: 'left',
      heroHeight: 'half',
      heroParallax: false,
      shelfDensity: 'comfortable',
      showFloatingSelector: true,
      backgroundType: 'solid',
    },
  },
}

export default theme
