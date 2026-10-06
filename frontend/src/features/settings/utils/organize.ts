export const SCAN_ON_LAUNCH_KEY = 'otix:scan-on-launch'

export const readScanOnLaunch = (): boolean => {
  try {
    return localStorage.getItem(SCAN_ON_LAUNCH_KEY) === 'true'
  } catch {
    return false
  }
}
