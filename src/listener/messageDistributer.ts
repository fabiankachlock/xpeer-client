import { XPeerIncomingMessage, XPeerMessageSource } from '../xpeer.js';

export class MessageDistributer<T = XPeerIncomingMessage> {
  private entryCount = Math.round(Math.random() * 1_000_000);

  private entryMap: Record<
    string,
    {
      id: string;
      handler: (msg: T) => void;
      guard: (msg: T) => boolean;
    }
  > = {};

  constructor(private readonly emptyHandler: (msg: T) => void) {}

  private nextId(): string {
    return (++this.entryCount).toString(16);
  }

  public createMessageSource(): XPeerMessageSource<T> {
    const id = this.nextId();

    this.entryMap[id] = {
      id: id,
      guard: () => false,
      /* eslint-disable-next-line @typescript-eslint/no-empty-function */
      handler: () => {},
    };

    return {
      setGuard: guard => {
        if (this.entryMap[id]) {
          this.entryMap[id].guard = guard;
        }
      },
      setHandler: handler => {
        if (this.entryMap[id]) {
          this.entryMap[id].handler = handler;
        }
      },
      redirectBack: this.emptyHandler,
      destroy: () => this.removeDistributionTarget(id),
    };
  }

  public removeDistributionTarget(id: string): void {
    delete this.entryMap[id];
  }

  public distribute(msg: T): void {
    let processed = false;
    for (const handler of Object.values(this.entryMap)) {
      if (handler.guard(msg)) {
        handler.handler(msg);
        processed = true;
      }
    }

    if (!processed) {
      this.emptyHandler(msg);
    }
  }
}
