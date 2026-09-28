import { OtixLoadingScreen } from '@ui/atoms/otix-loading-screen'

/** Shown while a lazy route chunk (or loader) is pending. */
export function RoutePending() {
  return <OtixLoadingScreen className="fixed inset-0 z-40" />
}
