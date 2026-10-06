export const PIN_KEY = 'otix_player_pinned'

export const loadPinState = (): boolean => {
  try {
    return localStorage.getItem(PIN_KEY) === 'true'
  } catch {
    return false
  }
}
