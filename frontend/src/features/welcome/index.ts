export { WelcomePage } from './pages/welcome-page'
export { FeatureGuideModal, type FeatureGuideModalProps } from './components/organisms/feature-guide-modal'
export { FeatureIntroCard, type FeatureIntroCardProps } from './components/molecules/feature-intro-card'
export { WelcomeHero, type WelcomeHeroProps } from './components/molecules/welcome-hero'
export { WelcomeCommandPaletteBar } from './components/molecules/welcome-command-palette-bar'
export { WelcomeGettingStartedSteps } from './components/molecules/welcome-getting-started-steps'
export { WelcomeVisibilityControls } from './components/molecules/welcome-visibility-controls'
export { useWelcomePreferences } from './hooks/use-welcome-preferences'
export {
  WELCOME_FEATURES,
  type WelcomeFeature,
  type WelcomeFeatureHighlight,
} from './constants/welcome-features'
export {
  readWelcomeNavPreference,
  writeWelcomeNavPreference,
  readWelcomeBannerPreference,
  writeWelcomeBannerPreference,
  WELCOME_NAV_STORAGE_KEY,
  WELCOME_BANNER_STORAGE_KEY,
} from './utils/welcome-preferences'
export { createWelcomeRoutes } from './router'
