import { XPeerCallback, XPeerPeer, XPeerVPeer } from '../xpeer.js';
import { Subscription } from './subscription.js';

// @internal
type Entry<T> = {
  id: string;
  handler: XPeerCallback<T>;
  sub: Subscription;
};

// @internal
export class ListenerManager<T> {
  private handlers: Record<
    string, // event-id
    Entry<T>[]
  >;

  private handlerCount = Math.round(Math.random() * 1_000_000);

  constructor() {
    this.handlers = {};
  }

  private nextId(): string {
    return (++this.handlerCount).toString(16);
  }

  public trigger(event: string, value: T, peer: XPeerPeer | XPeerVPeer): void {
    const handlers = this.handlers[event];
    if (!handlers || !Array.isArray(handlers)) return;
    for (const handler of handlers) {
      handler.handler(value, peer, handler.sub);
    }
  }

  public register(event: string, handler: XPeerCallback<T>): Subscription {
    const id = this.nextId();
    const entry: Entry<T> = {
      id: id,
      handler: handler,
      sub: new Subscription(id, () => this.removeHandler(event, id)),
    };

    if (this.handlers[event]) {
      this.handlers[event].push(entry);
    } else {
      this.handlers[event] = [entry];
    }

    return new Subscription(entry.id, () =>
      this.removeHandler(event, entry.id)
    );
  }

  private removeHandler(event: string, handlerId: string) {
    if (this.handlers[event]) {
      this.handlers[event] = this.handlers[event].filter(
        entry => entry.id !== handlerId
      );
    }
  }
}
