import type { CommandProvider } from './types'

const providers = new Map<string, CommandProvider>()

/**
 * Register a command provider. Returns an unregister function for cleanup.
 *
 * Registration is runtime (not module import-time) so features can opt in and
 * out, and tests can register/unregister in isolation.
 */
export function registerHubProvider(provider: CommandProvider): () => void {
  providers.set(provider.id, provider)
  return () => {
    providers.delete(provider.id)
  }
}

export function getHubProviders(): CommandProvider[] {
  return Array.from(providers.values())
}

export function getHubProvider(id: string): CommandProvider | undefined {
  return providers.get(id)
}

/** For tests / debug. */
export function clearHubProviders(): void {
  providers.clear()
}
