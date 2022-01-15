import { Logger } from '../helper/logger.js';
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
      Logger.Socket.warn(`could not send to ${this.url}`);
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
    Logger.Socket.log(`connected to ${this.url}`);
    this.options.retriesLeft = this.options.retries;
    if (this.connectionAwaiter) {
      this.connectionAwaiter.callback();
      this.connectionAwaiter = undefined;
    }
  };
  private handleMessage = (event: MessageEvent): void => {
    Logger.Socket.log(`received from ${this.url}`);
    this._messageForwarder(event.data);
  };

  private handleError = (error: Event): void => {
    Logger.Socket.error(
      `[ERR] ${(error as unknown as Error).message ?? 'unknown'}`
    );
  };

  private handleClose = (event: CloseEvent): void => {
    if (event.wasClean) {
      Logger.Socket.log(`disconnected from ${this.url}`);
    } else {
      Logger.Socket.log(`connection died to  ${this.url}`);
    }
    Logger.Socket.debug(`retries left: ${this.options.retriesLeft}`);

    if (this.options.retriesLeft > 0) {
      this.options.retriesLeft = this.options.retriesLeft - 1;
      Logger.Socket.debug(`retrying in ${this.options.retryInterval}ms`);
      setTimeout(() => {
        this.connect();
      }, this.options.retryInterval);
    }
  };
}
