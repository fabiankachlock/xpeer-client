import { ListenerManager } from './listener/listenerManager.js';
import { Subscription } from './listener/subscription.js';
import { Awaiter } from './helper/awaiter.js';
import { createXPeerResponse } from './helper/error.js';
import { XPeerMessageBuilder } from './ws/messages.js';
import {
  XPeerVPeer,
  XPeerIncomingMessage,
  XPeerIncomingMessageType,
  XPeerOperationalClient,
  XPeerOutgoingMessageType,
  XPeerResponse,
  XPeerEvent,
  XPeerCallback,
  XPeerState,
} from './xpeer.js';
import { Logger } from './helper/logger.js';

export class VPeer<S extends XPeerState> implements XPeerVPeer<S> {
  public readonly isVirtual: true;

  private listenerManager = new ListenerManager<unknown>();

  private logger: Logger;

  constructor(
    public readonly id: string,
    private readonly client: XPeerOperationalClient
  ) {
    this.isVirtual = true;
    this.client.messageSource.setGuard(
      message =>
        message.sender === id &&
        (message.type === XPeerIncomingMessageType.MSG_SEND ||
          message.type === XPeerIncomingMessageType.MSG_STATE_UPDATE)
    );
    this.client.messageSource.setHandler(this.receiveMessage);
    this.logger = Logger.Peer.withPrefix(`[virtual::${id}]`);
  }

  public ping(): Promise<boolean> {
    return this.client.ping(this.id);
  }

  private receiveMessage = (message: XPeerIncomingMessage): void => {
    this.logger.debug('received message', message);
    if (message.type === XPeerIncomingMessageType.MSG_SEND) {
      this.listenerManager.trigger(XPeerEvent.message, message.payload, this);
    } else if (message.type === XPeerIncomingMessageType.MSG_STATE_UPDATE) {
      this.listenerManager.trigger(
        XPeerEvent.stateUpdate,
        JSON.parse(message.payload),
        this
      );
    }
  };

  public on(event: 'message', handler: XPeerCallback<string>): Subscription;
  public on(event: 'state', handler: XPeerCallback<S>): Subscription;
  public on(event: string, handler: XPeerCallback<any>): Subscription {
    return this.listenerManager.register(event, handler);
  }

  public once(event: 'message', handler: XPeerCallback<string>): Subscription;
  public once(event: 'state', handler: XPeerCallback<S>): Subscription;
  public once(
    event: 'message' | 'state',
    handler: XPeerCallback<any>
  ): Subscription {
    return this.listenerManager.register(event, (msg, peer, sub) => {
      handler(msg, peer, sub);
      sub.cancel();
    });
  }

  public async sendMessage(msg: string): Promise<XPeerResponse> {
    let error: string | undefined = undefined;
    this.logger.debug('sending message');
    await this.client.executeTask(async ({ receiveMessage, send }) => {
      const awaiter = new Awaiter();
      await send(
        XPeerMessageBuilder.create(
          XPeerOutgoingMessageType.OPR_SEND_DIRECT,
          this.id,
          msg
        )
      );

      receiveMessage(message => {
        if (
          message.type === XPeerIncomingMessageType.MSG_SUCCESS &&
          message.sender === this.client.peerId &&
          message.payload === this.id
        ) {
          this.logger.debug('message successful');
          awaiter.callback({});
          return true;
        } else if (
          message.type === XPeerIncomingMessageType.MSG_ERROR &&
          message.sender === this.client.peerId
        ) {
          error = message.payload;
          this.logger.error(error);
          awaiter.callback({});
          return true;
        }
        return false;
      });
      await awaiter.promise;
    });

    return createXPeerResponse(error);
  }

  public async connect(): Promise<XPeerResponse> {}

  public async disconnect(): Promise<void> {}

  public async patchState(state: S): Promise<XPeerResponse> {}

  public async putState(state: S): Promise<XPeerResponse> {}
}
