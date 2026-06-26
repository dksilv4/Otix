import type { LauncherThemeModule } from '../types'

const theme: LauncherThemeModule = {
  default: {
    meta: {
      id: 'default',
      name: 'Otix Dark',
      description: 'The default dark launcher theme with glass-morphism cards and parallax hero.',
      author: 'Otix',
      version: '1.0.0',
      preview: '',
    },
    components: {},
    tokens: {},
    layout: {
      navPosition: 'left',
      heroHeight: 'full',
      heroParallax: true,
      shelfDensity: 'comfortable',
      showFloatingSelector: true,
      backgroundType: 'gradient',
    },
  },
}

export default theme
