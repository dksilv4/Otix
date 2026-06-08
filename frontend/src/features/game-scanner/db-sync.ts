import { getDesktopAPI } from '@/lib/desktop-api';

type Listener = () => void;

const listeners = new Set<Listener>();
let unsub: (() => void) | null = null;

/**
 * Subscribe to game DB changes from the main process.
 * Returns an unsubscribe function.
 */
export function subscribeToGameDbChanges(listener: Listener): () => void {
  listeners.add(listener);

  // Lazy-init the IPC listener (first subscriber wires it up)
  if (!unsub) {
    const api = getDesktopAPI();
    if (api?.onGamesDbChanged) {
      unsub = api.onGamesDbChanged(() => {
        listeners.forEach((fn) => fn());
      });
    }
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsub) {
      unsub();
      unsub = null;
    }
  };
}
