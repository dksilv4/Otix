export const SETTINGS_SIDEBAR_COLLAPSED_KEY = 'otix-settings-sidebar-collapsed'

export const getInitialCollapsed = (): boolean => {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(SETTINGS_SIDEBAR_COLLAPSED_KEY) === 'true'
}
