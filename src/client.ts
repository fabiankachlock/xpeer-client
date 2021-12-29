import { Awaiter } from './helper/awaiter.js';
import { TaskQueue } from './helper/queue.js';
import { XPeerWSConnection } from './ws/connection.js';
import {
  XPeerMessageBuilder,
  XPeerMessageParsingInterceptor,
} from './ws/messages.js';
import {
  XPeer,
  XPeerIncomingMessage,
  XPeerIncomingMessageType,
  XPeerOutgoingMessageType,
} from './xpeer.js';

const DEFAULT_PEER_ID = '<<<no-peer-id>>>';

export class XPeerClient {
  private connection: XPeerWSConnection;

  private tasks = new TaskQueue();

  private peerId = DEFAULT_PEER_ID;

  private openTask = false;

  constructor(public readonly serverUrl: string) {
    this.connection = new XPeerWSConnection(serverUrl);
    this.connection.messageForwarder =
      XPeerMessageParsingInterceptor.messageForwarder(
        this.messageDistributer
      ).callback;
  }

  private messageDistributer = (message: XPeerIncomingMessage) => {
    console.log('[Client] received:', message);
    if (this.openTask) {
      console.log('[Client] forward message to task');
      this.forwardMessageToTask(message);
    } else {
      this.messageHandler(message);
    }
  };

  private forwardMessageToTask: (message: XPeerIncomingMessage) => void =
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    () => {};

  private messageHandler(message: XPeerIncomingMessage) {
    console.log('[Client] message in final handler');
    if (
      message.type === XPeerIncomingMessageType.MSG_PEER_ID &&
      message.sender !== this.peerId
    ) {
      console.log('[Client] received id:', message.payload);
      this.peerId = message.payload;
    } else if (message.type === XPeerIncomingMessageType.MSG_PING) {
      console.log('[Client] received ping from', message.sender);
      this.connection.send(
        XPeerMessageBuilder.create(
          XPeerOutgoingMessageType.OPR_PONG,
          message.sender,
          ''
        )
      );
    } else if (message.type === XPeerIncomingMessageType.MSG_SEND) {
      console.log(`[${message.sender}] received ${message.payload}`);
    }
  }

  public disconnect(): void {
    this.connection.close();
  }

  public async ping(id: string): Promise<boolean> {
    let foundPeer = false;
    this.openTask = true;
    await this.tasks.execute(async () => {
      const awaiter = new Awaiter();
      await this.connection.send(
        XPeerMessageBuilder.create(XPeerOutgoingMessageType.OPR_PING, id, '')
      );

      this.forwardMessageToTask = message => {
        if (
          message.type === XPeerIncomingMessageType.MSG_PONG &&
          message.sender === id
        ) {
          console.log(`[Client] ping ok ${id}`);
          foundPeer = true;
          awaiter.callback({});
        } else if (
          message.type === XPeerIncomingMessageType.MSG_ERROR &&
          message.sender === this.peerId
        ) {
          console.error(message.payload);
          awaiter.callback({});
        } else {
          this.messageHandler(message);
        }
      };
      await awaiter.promise;
      this.openTask = false;
    });
    return foundPeer;
  }

  public async getPeer(id: string): Promise<XPeer | undefined> {
    const available = await this.ping(id);
    if (available) {
      return this.createPeerObject(id);
    }
    return undefined;
  }

  private createPeerObject(id: string): XPeer {
    return {
      id: id,
      isVirtual: false,
      ping: () => this.ping(id),
      sendMessage: async msg => {
        let error: string | undefined = undefined;
        this.openTask = true;
        await this.tasks.execute(async () => {
          const awaiter = new Awaiter();
          await this.connection.send(
            XPeerMessageBuilder.create(
              XPeerOutgoingMessageType.OPR_SEND_DIRECT,
              id,
              msg
            )
          );

          this.forwardMessageToTask = message => {
            if (
              message.type === XPeerIncomingMessageType.MSG_SUCCESS &&
              message.sender === this.peerId &&
              message.payload === id
            ) {
              awaiter.callback({});
            } else if (
              message.type === XPeerIncomingMessageType.MSG_ERROR &&
              message.sender === this.peerId
            ) {
              error = message.payload;
              awaiter.callback({});
            } else {
              this.messageHandler(message);
            }
          };
          await awaiter.promise;
          this.openTask = false;
        });
        if (error) {
          return {
            message: error,
          };
        }
        return {
          success: true,
        };
      },
    };
  }
}
