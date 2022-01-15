import { ListenerManager } from 'listner/listenerManager.js';
import { Subscription } from 'listner/subscription.js';
import { Awaiter } from './helper/awaiter.js';
import { createXPeerResponse } from './helper/error.js';
import { XPeerMessageBuilder } from './ws/messages.js';
import {
  XPeerPeer,
  XPeerIncomingMessage,
  XPeerIncomingMessageType,
  XPeerMessageSource,
  XPeerOperationalClient,
  XPeerOutgoingMessageType,
  XPeerResponse,
} from './xpeer.js';

export class Peer implements XPeerPeer {
  readonly isVirtual: boolean;

  private readonly messageSource: XPeerMessageSource;

  private listenerManager = new ListenerManager();

  constructor(
    public readonly id: string,
    private readonly client: XPeerOperationalClient
  ) {
    this.isVirtual = false;
    this.messageSource = client.getMessageSource(id);
    this.messageSource.setGuard(message => message.sender === id);
    this.messageSource.setHandler(this.receiveMessage);
  }

  public ping(): Promise<boolean> {
    return this.client.ping(this.id);
  }

  private receiveMessage = (message: XPeerIncomingMessage): void => {
    console.log(message);
  };

  public on(
    event: 'message',
    handler: (msg: string, peer: XPeerPeer, sub: Subscription) => void
  ): Subscription {
    return this.listenerManager.register('s', handler);
  }

  public once(
    event: 'message',
    handler: (msg: string, peer: XPeerPeer, sub: Subscription) => void
  ): Subscription {
    return this.listenerManager.register('s', handler);
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
