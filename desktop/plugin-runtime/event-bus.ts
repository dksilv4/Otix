// desktop/plugins/event-bus.ts
import { EventEmitter } from 'events'
import type { OtixEventName, OtixEvents } from './types'

export class IsolatedEventBus {
  private emitter: EventEmitter
  private listenerErrors: Map<string, number> = new Map()

  constructor() {
    this.emitter = new EventEmitter()
    this.emitter.setMaxListeners(0)
    this.emitter.on('error', (eventName: string, error: Error, pluginId: string) => {
      console.error(
        `[eventBus] Error in listener for "${eventName}" (plugin: ${pluginId}):`,
        error.message
      )
      this.listenerErrors.set(
        pluginId,
        (this.listenerErrors.get(pluginId) || 0) + 1
      )
    })
  }

  on<E extends OtixEventName>(
    event: E,
    listener: (payload: OtixEvents[E]) => void,
    pluginId: string
  ): () => void {
    const wrapped = (...args: unknown[]) => {
      try {
        listener(args[0] as OtixEvents[E])
      } catch (error) {
        this.emitter.emit('error', event, error, pluginId)
      }
    }
    this.emitter.on(event, wrapped)
    return () => {
      this.emitter.off(event, wrapped)
    }
  }

  emit<E extends OtixEventName>(event: E, payload: OtixEvents[E]): boolean {
    return this.emitter.emit(event, payload)
  }

  getErrorCount(pluginId: string): number {
    return this.listenerErrors.get(pluginId) || 0
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners()
  }
}

// Singleton for the app
export const eventBus = new IsolatedEventBus()
