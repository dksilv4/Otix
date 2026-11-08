import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { App } from '@capacitor/app'
import { isNativeMobile, getPlatformInfo } from '../platform'

export const initMobileApp = async (): Promise<void> => {
  if (!isNativeMobile()) return

  const platformInfo = getPlatformInfo()

  // Set DOM attributes for mobile CSS targeting
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-mobile-platform', platformInfo.platform)
    document.documentElement.classList.add('is-native-mobile')
  }

  // Configure Status Bar
  try {
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setOverlaysWebView({ overlay: true })
  } catch {
    // Web / unsupported
  }

  // Handle hardware Android back button
  try {
    await App.addListener('backButton', ({ canGoBack }) => {
      // If modal or open dialog is present, close it via Esc key dispatch
      const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      const modalActive = Boolean(document.querySelector('[role="dialog"], [data-state="open"]'))
      if (modalActive) {
        document.dispatchEvent(escEvent)
        return
      }

      if (canGoBack && window.history.length > 1) {
        window.history.back()
      } else {
        void App.exitApp()
      }
    })
  } catch {
    // Non-native fallback
  }

  // Hide splash screen after initialization
  try {
    await SplashScreen.hide()
  } catch {
    // Ignored if already hidden or unsupported
  }
}
