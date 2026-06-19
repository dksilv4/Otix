import EventEmitter from 'events';
import { OtixEventName, OtixEvents } from './types';

class OtixEventBus extends EventEmitter {
  emit<E extends OtixEventName>(event: E, payload: OtixEvents[E]): boolean {
    return super.emit(event, payload);
  }

  on<E extends OtixEventName>(event: E, handler: (payload: OtixEvents[E]) => void): this {
    super.on(event, handler);
    return this;
  }

  off<E extends OtixEventName>(event: E, handler: (payload: OtixEvents[E]) => void): this {
    super.off(event, handler);
    return this;
  }
}

export const eventBus = new OtixEventBus();
