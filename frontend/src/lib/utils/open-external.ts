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
