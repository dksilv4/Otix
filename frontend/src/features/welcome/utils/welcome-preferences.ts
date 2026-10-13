export const WELCOME_NAV_STORAGE_KEY = 'otix:welcome-nav-visible'
export const WELCOME_BANNER_STORAGE_KEY = 'otix:welcome-banner-visible'

export const readWelcomeNavPreference = (onboardingCompleted?: boolean): boolean => {
  try {
    const raw = localStorage.getItem(WELCOME_NAV_STORAGE_KEY)
    if (raw !== null) {
      return raw === 'true'
    }
  } catch {
    // ignore local storage errors
  }
  // Default to true for new / non-onboarded users, false if user has already completed onboarding
  return onboardingCompleted !== true
}

export const writeWelcomeNavPreference = (visible: boolean): void => {
  try {
    localStorage.setItem(WELCOME_NAV_STORAGE_KEY, String(visible))
  } catch {
    // ignore
  }
}

export const readWelcomeBannerPreference = (onboardingCompleted?: boolean): boolean => {
  try {
    const raw = localStorage.getItem(WELCOME_BANNER_STORAGE_KEY)
    if (raw !== null) {
      return raw === 'true'
    }
  } catch {
    // ignore
  }
  // Default to true for new / non-onboarded users, false if completed
  return onboardingCompleted !== true
}

export const writeWelcomeBannerPreference = (visible: boolean): void => {
  try {
    localStorage.setItem(WELCOME_BANNER_STORAGE_KEY, String(visible))
  } catch {
    // ignore
  }
}
