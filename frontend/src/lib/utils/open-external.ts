/**
 * Opens a URL in the user's default browser.
 *
 * In Electron this delegates to the main process (`shell.openExternal`).
 * In the browser it navigates the current tab via `window.location.href`.
 */
export function openExternal(url: string): void {
  const desktopApi = window.desktopAPI as unknown as { openExternal: (url: string) => Promise<void> } | undefined
  if (desktopApi) {
    // Don't await — fire-and-forget so the renderer stays on the current page
    desktopApi.openExternal(url).catch(() => {
      // fallback: navigate in-window if IPC fails
      window.location.href = url
    })
  } else {
    window.location.href = url
  }
}

/**
 * Opens a URL in a standalone app window that shares the default web session
 * used by plugin OAuth windows — so pages that need the user's logged-in
 * account session (e.g. the Epic Games Store) open already signed in.
 * Falls back to the external browser when the IPC is unavailable.
 */
export function openSessionWindow(url: string): void {
  const desktopApi = window.desktopAPI as unknown as { openSessionWindow?: (url: string) => Promise<void> } | undefined
  if (desktopApi?.openSessionWindow) {
    desktopApi.openSessionWindow(url).catch(() => openExternal(url))
  } else {
    openExternal(url)
  }
}
