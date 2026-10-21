export const FEATURE_SPOTLIGHT_EVENT = 'otix:feature-spotlight'

export interface FeatureSpotlightEventDetail {
  tipId?: string
}

export const openFeatureSpotlight = (tipId?: string): void => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<FeatureSpotlightEventDetail>(FEATURE_SPOTLIGHT_EVENT, {
      detail: { tipId },
    }),
  )
}
