/** Imperative opener for the Decide Watch modal (Hub Cmd+K + Discover CTA). */

export const DECIDE_WATCH_EVENT = 'otix:decide-watch'

export function openDecideWatch() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(DECIDE_WATCH_EVENT))
}
