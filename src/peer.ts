import { ListenerManager } from './listener/listenerManager.js';
import { Subscription } from './listener/subscription.js';
import { Awaiter } from './helper/awaiter.js';
import { createXPeerResponse } from './helper/error.js';
import { XPeerMessageBuilder } from './ws/messages.js';
import {
  XPeerPeer,
  XPeerIncomingMessage,
  XPeerIncomingMessageType,
  XPeerOperationalClient,
  XPeerOutgoingMessageType,
  XPeerResponse,
  XPeerEvent,
  XPeerCallback,
} from './xpeer.js';
import { Logger } from './helper/logger.js';

export class Peer implements XPeerPeer {
  public readonly isVirtual: boolean;

  private listenerManager = new ListenerManager<string>();

  private logger: Logger;

  constructor(
    public readonly id: string,
    private readonly client: XPeerOperationalClient
  ) {
    this.isVirtual = false;
    this.client.messageSource.setGuard(message => message.sender === id);
    this.client.messageSource.setHandler(this.receiveMessage);
    this.logger = Logger.Peer.withPrefix(`[${id}]`);
  }

  public ping(): Promise<boolean> {
    return this.client.ping(this.id);
  }

  private receiveMessage = (message: XPeerIncomingMessage): void => {
    this.logger.debug('received message');
    this.listenerManager.trigger(XPeerEvent.message, message.payload, this);
  };

  public on(event: 'message', handler: XPeerCallback<string>): Subscription {
    return this.listenerManager.register(event, handler);
  }

  public once(event: 'message', handler: XPeerCallback<string>): Subscription {
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
}
