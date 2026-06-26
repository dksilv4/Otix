import type { LauncherThemeModule } from '../types'
import { RetroHero } from './components/retro-hero'
import { RetroGameThumb } from './components/retro-game-thumb'
import { RetroProgressBar } from './components/retro-progress-bar'
import { RetroPlayButton } from './components/retro-play-button'
import { RetroFloatingSelector } from './components/retro-floating-selector'
import { RetroFooter } from './components/retro-footer'

const theme: LauncherThemeModule = {
  default: {
    meta: {
      id: 'retro',
      name: 'Retro',
      description: 'CRT monitor aesthetic with scanlines, phosphor glow, and pixel-perfect fonts.',
      author: 'Otix',
      version: '1.0.0',
      preview: '',
    },
    components: {
      Hero: RetroHero,
      GameThumb: RetroGameThumb,
      ProgressBar: RetroProgressBar,
      PlayButton: RetroPlayButton,
      FloatingSelector: RetroFloatingSelector,
      Footer: RetroFooter,
    },
    tokens: {
      '--dk-font-sans': '"Courier New", monospace',
      '--dk-radius-sm': '0px',
      '--dk-radius-md': '0px',
      '--dk-radius-lg': '0px',
      '--dk-radius-xl': '0px',
      '--dk-shadow-glass': '0 0 10px rgba(0,255,65,0.15)',
      '--dk-shadow-dialog': '0 0 20px rgba(0,255,65,0.2)',
      '--dk-surface-glass': 'rgba(0,0,0,0.85)',
      '--dk-surface-base': '#0a0a0a',
      '--color-background': '#000000',
      '--color-foreground': '#00ff41',
    },
    layout: {
      navPosition: 'top',
      heroHeight: 'compact',
      heroParallax: false,
      shelfDensity: 'compact',
      showFloatingSelector: true,
      backgroundType: 'solid',
    },
  },
}

export default theme
