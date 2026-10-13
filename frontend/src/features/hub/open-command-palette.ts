export const COMMAND_PALETTE_EVENT = 'otix:open-command-palette'

export function openCommandPalette() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_EVENT))
}
