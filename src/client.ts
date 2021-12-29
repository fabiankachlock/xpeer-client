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
      this.peerId === DEFAULT_PEER_ID
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

  // public async getPeer(id: string): Promise<XPeer | XVPeer | undefined> {
  //   return this.createPeerObject(id);
  // }

  // private createPeerObject(id: string): XPeer {
  //   return {
  //     id: id,
  //     isVirtual: false,
  //     sendMessage: msg => {},
  //     on: (event, callback) => {},
  //     once: (event, callback) => {},
  //   };
  // }
}
