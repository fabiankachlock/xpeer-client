import { Awaiter } from './helper/awaiter.js';
import { createXPeerResponse } from './helper/error.js';
import { XPeerMessageBuilder } from './ws/messages.js';
import {
  XPeer,
  XPeerIncomingMessageType,
  XPeerMessageSource,
  XPeerOperationalClient,
  XPeerOutgoingMessageType,
  XPeerResponse,
} from './xpeer.js';

export class Peer implements XPeer {
  readonly isVirtual: boolean;

  private readonly messageSource: XPeerMessageSource;

  constructor(
    public readonly id: string,
    private readonly client: XPeerOperationalClient
  ) {
    this.isVirtual = false;
    this.messageSource = client.getMessageSource(id);
    this.messageSource.setGuard(message => message.sender === id);
  }

  private async run() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const message = await this.messageSource.receiveMessage();

      if (message?.message) {
        console.log(message);
      }

      if (message?.wasLast) {
        return;
      }
    }
  }

  public ping(): Promise<boolean> {
    return this.client.ping(this.id);
  }

  public async sendMessage(msg: string): Promise<XPeerResponse> {
    let error: string | undefined = undefined;

    await this.client.executeTask(async ({ receiveMessage }) => {
      const awaiter = new Awaiter();
      await this.client.send(
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
