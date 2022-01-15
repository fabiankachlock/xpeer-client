import { nanoid } from 'nanoid';
import { Subscription } from './subscription';

export class ListenerManager<T> {
  private handlers: Record<
    string,
    {
      id: string;
      handler: (value: T) => void;
    }[]
  >;

  constructor() {
    this.handlers = {};
  }

  register(id: string, handler: (value: T) => void): Subscription {
    const entry = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      id: nanoid(),
      handler: handler,
    };

    if (this.handlers[id]) {
      this.handlers[id].push(entry);
    } else {
      this.handlers[id] = [entry];
    }

    return new Subscription(entry.id, () => this.removeHandler(id, entry.id));
  }

  private removeHandler(id: string, handlerId: string) {
    if (this.handlers[id]) {
      this.handlers[id] = this.handlers[id].filter(
        entry => entry.id !== handlerId
      );
    }
  }
}
