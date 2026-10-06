export const COOKIE_CONSENT_KEY = 'otix_cookie_consent'

export type CookieConsentState = 'all' | 'necessary' | null

export const getCookieConsent = (): CookieConsentState => {
  if (typeof window === 'undefined') return null
  try {
    return (localStorage.getItem(COOKIE_CONSENT_KEY) as CookieConsentState) || null
  } catch {
    return null
  }
}
