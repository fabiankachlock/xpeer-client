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

export class Peer implements XPeerPeer {
  public readonly isVirtual: boolean;

  private listenerManager = new ListenerManager<string>();

  constructor(
    public readonly id: string,
    private readonly client: XPeerOperationalClient
  ) {
    this.isVirtual = false;
    this.client.messageSource.setGuard(message => message.sender === id);
    this.client.messageSource.setHandler(this.receiveMessage);
  }

  public ping(): Promise<boolean> {
    return this.client.ping(this.id);
  }

  private receiveMessage = (message: XPeerIncomingMessage): void => {
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
          awaiter.callback({});
          return true;
        } else if (
          message.type === XPeerIncomingMessageType.MSG_ERROR &&
          message.sender === this.client.peerId
        ) {
          error = message.payload;
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
