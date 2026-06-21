import type { Channel, NotificationEvent } from '../types'

export class NotificationRouter {
  private channels: Channel[] = []

  registerChannel(channel: Channel): void {
    this.channels.push(channel)
  }

  route(event: NotificationEvent): void {
    for (const channel of this.channels) {
      if (channel.canDeliver(event)) {
        Promise.resolve(channel.deliver(event)).catch(() => {
          // Channel delivery failed — channel logs internally
        })
      }
    }
  }
}
