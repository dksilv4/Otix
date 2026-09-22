export interface OpenExternalOptions {
  /**
   * If true, opens the URL in a new browser tab/window (`window.open`) when running
   * in a web browser. In Electron desktop, `desktopApi.openExternal` is used which
   * launches the OS default browser without navigating the app window.
   * If false or omitted, navigates the current tab (`window.location.href`)
   * for standard full-page OAuth redirect flows (e.g. Google or Spotify login).
   */
  newTab?: boolean
}

/**
 * Opens a URL in the user's default browser.
 *
 * In Electron this delegates to the main process (`shell.openExternal`).
 * In the browser it opens a new tab when `options?.newTab` is true, or navigates
 * the current tab via `window.location.href`.
 */
export function openExternal(url: string, options?: OpenExternalOptions): void {
  const desktopApi = window.desktopAPI as unknown as { openExternal: (url: string) => Promise<void> } | undefined
  if (desktopApi) {
    // Don't await — fire-and-forget so the renderer stays on the current page
    desktopApi.openExternal(url).catch(() => {
      // fallback: navigate or open window if IPC fails
      if (options?.newTab) {
        window.open(url, '_blank', 'noopener,noreferrer')
      } else {
        window.location.href = url
      }
    })
  } else if (options?.newTab) {
    window.open(url, '_blank', 'noopener,noreferrer')
  } else {
    window.location.href = url
  }
}

/**
 * Opens a URL in a standalone app window that shares the default web session
 * used by plugin OAuth windows — so pages that need the user's logged-in
 * account session (e.g. the Epic Games Store) open already signed in.
 * Falls back to opening in a new tab or external browser when the IPC is unavailable.
 */
export function openSessionWindow(url: string): void {
  const desktopApi = window.desktopAPI as unknown as { openSessionWindow?: (url: string) => Promise<void> } | undefined
  if (desktopApi?.openSessionWindow) {
    desktopApi.openSessionWindow(url).catch(() => openExternal(url, { newTab: true }))
  } else {
    openExternal(url, { newTab: true })
  }
}
