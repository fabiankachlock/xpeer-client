import { Awaiter } from '../helper/awaiter.js';

// @internal
export type XPeerWSConnectionOptions = {
  retries: number;
  retryInterval: number;
};

// @internal
export const DefaultXPeerWSConnectionOptions = {
  retries: 5,
  retryInterval: 2000,
};

// @internal
export class WSConnection {
  private socket: WebSocket | undefined;

  private options: XPeerWSConnectionOptions & { retriesLeft: number };

  private connectionAwaiter: Awaiter<void> | undefined;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private _messageForwarder: (msg: string) => void = () => {};

  constructor(public readonly url: string, options?: XPeerWSConnectionOptions) {
    this.connect();
    this.options = {
      ...DefaultXPeerWSConnectionOptions,
      ...options,
      retriesLeft: 0,
    };

    this.options.retriesLeft = this.options.retries;
  }

  public close(): void {
    this.options.retries = 0;
    this.socket?.close();
  }

  public async send(data: string): Promise<void> {
    if (this.socket && !this.connectionAwaiter) {
      this.socket.send(data);
    } else if (this.connectionAwaiter) {
      await this.connectionAwaiter.promise;
      return this.send(data);
    } else {
      console.log(`[Socket] could not send to ${this.url}`);
    }
  }

  public set messageForwarder(callback: (msg: string) => void) {
    this._messageForwarder = callback;
  }

  private connect(): void {
    if (this.socket && this.socket.readyState === this.socket.OPEN) return;
    else if (this.socket) {
      this.socket.close();
      this.socket = undefined;
    }

    this.socket = new WebSocket(this.url);
    this.connectionAwaiter = new Awaiter(() => true);
    if (this.socket) {
      this.socket.addEventListener('open', this.handleOpen);
      this.socket.addEventListener('message', this.handleMessage);
      this.socket.addEventListener('error', this.handleError);
      this.socket.addEventListener('close', this.handleClose);
    }
  }

  private handleOpen = (): void => {
    console.log(`[Socket] connected to ${this.url}`);
    this.options.retriesLeft = this.options.retries;
    if (this.connectionAwaiter) {
      this.connectionAwaiter.callback();
      this.connectionAwaiter = undefined;
    }
  };
  private handleMessage = (event: MessageEvent): void => {
    console.log(`[Socket] received from ${this.url}`);
    console.log(event.data);
    this._messageForwarder(event.data);
  };

  private handleError = (error: Event): void => {
    console.error(
      `[ERR] [Socket] ${(error as unknown as Error).message ?? 'unknown'}`
    );
    console.error(error);
  };

  private handleClose = (event: CloseEvent): void => {
    if (event.wasClean) {
      console.log(`[Socket] disconnected from ${this.url}`);
    } else {
      console.log(`[Socket] connection died to  ${this.url}`);
    }
    console.log(`[Socket] retries left: ${this.options.retriesLeft}`);

    if (this.options.retriesLeft > 0) {
      this.options.retriesLeft = this.options.retriesLeft - 1;
      console.log(`[Socket] retrying in ${this.options.retryInterval}ms`);
      setTimeout(() => {
        this.connect();
      }, this.options.retryInterval);
    }
  };
}
