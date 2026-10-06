export const LOCAL_PREFS_KEY = 'otix:local-notification-preferences'

export const getLocalPrefs = (): Record<string, boolean | string> => {
  try {
    const raw = localStorage.getItem(LOCAL_PREFS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export const saveLocalPrefs = (prefs: Record<string, boolean | string>): void => {
  try {
    localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}
