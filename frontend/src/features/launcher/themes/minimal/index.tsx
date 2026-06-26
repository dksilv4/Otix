import type { LauncherThemeModule } from '../types'
import { MinimalHero } from './components/minimal-hero'
import { MinimalShelfCard } from './components/minimal-shelf-card'
import { MinimalGameStats } from './components/minimal-game-stats'

const theme: LauncherThemeModule = {
  default: {
    meta: {
      id: 'minimal',
      name: 'Minimal',
      description: 'Stripped-down, high-contrast launcher. No glass, no animations, maximum speed.',
      author: 'Otix',
      version: '1.0.0',
      preview: '',
    },
    components: {
      Hero: MinimalHero,
      ShelfCard: MinimalShelfCard,
      GameStats: MinimalGameStats,
    },
    tokens: {
      '--dk-radius-sm': '0px',
      '--dk-radius-md': '0px',
      '--dk-radius-lg': '0px',
      '--dk-radius-xl': '0px',
      '--dk-radius-2xl': '0px',
      '--dk-radius-3xl': '0px',
      '--dk-radius-full': '0px',
      '--dk-shadow-xs': 'none',
      '--dk-shadow-sm': 'none',
      '--dk-shadow-md': 'none',
      '--dk-shadow-lg': 'none',
      '--dk-shadow-xl': 'none',
      '--dk-shadow-glass': 'none',
      '--dk-shadow-dialog': 'none',
      '--dk-duration-fast': '0ms',
      '--dk-duration-normal': '0ms',
      '--dk-duration-slow': '0ms',
      '--dk-duration-page': '0ms',
      '--dk-surface-glass': 'rgba(0,0,0,0.95)',
      '--dk-surface-glass-hover': 'rgba(0,0,0,0.98)',
    },
    layout: {
      navPosition: 'left',
      heroHeight: 'compact',
      heroParallax: false,
      shelfDensity: 'compact',
      showFloatingSelector: false,
      backgroundType: 'solid',
    },
  },
}

export default theme
