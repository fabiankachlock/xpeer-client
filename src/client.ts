import { Peer } from './peer.js';
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
  XPeerMessageHandler,
  XPeerOperationalClient,
  XPeerOutgoingMessageType,
} from './xpeer.js';

const DEFAULT_PEER_ID = '<<<no-peer-id>>>';

export class XPeerClient {
  private connection: XPeerWSConnection;

  private tasks = new TaskQueue();

  private peerId = DEFAULT_PEER_ID;

  private openTask = false;

  private messageHandlers: XPeerMessageHandler[];

  constructor(public readonly serverUrl: string) {
    this.connection = new XPeerWSConnection(serverUrl);
    this.connection.messageForwarder =
      XPeerMessageParsingInterceptor.messageForwarder(
        this.messageDistributer
      ).callback;

    this.messageHandlers = [
      this.idMessageHandler,
      this.pingMessageHandler,
      this.defaultMessageHandler,
    ];
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
    for (const handler of this.messageHandlers) {
      if (handler.guard(message)) {
        console.log(handler);
        handler.handler(message);
        break;
      }
    }
  }

  private defaultMessageHandler: XPeerMessageHandler = {
    // handle incoming messages
    guard: message => message.type === XPeerIncomingMessageType.MSG_SEND,
    handler: message =>
      console.log(`[${message.sender}] received ${message.payload}`),
  };

  private pingMessageHandler: XPeerMessageHandler = {
    // handle incoming pings
    guard: message => message.type === XPeerIncomingMessageType.MSG_PING,
    handler: message => {
      console.log('[Client] received ping from', message.sender);
      this.tasks.execute(async () => {
        await this.connection.send(
          XPeerMessageBuilder.create(
            XPeerOutgoingMessageType.OPR_PONG,
            message.sender,
            ''
          )
        );
      });
    },
  };

  private idMessageHandler: XPeerMessageHandler = {
    // handle id assignment
    guard: message =>
      message.type === XPeerIncomingMessageType.MSG_PEER_ID &&
      message.sender === message.payload &&
      message.sender !== this.peerId,
    handler: message => {
      console.log('[Client] received id:', message.payload);
      this.peerId = message.payload;
    },
  };

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
      return new Peer(id, this.createConnectionForwardRef());
    }
    return undefined;
  }

  private createConnectionForwardRef = (): XPeerOperationalClient => {
    const client: XPeerOperationalClient = {
      peerId: this.peerId,
      ping: (id: string) => this.ping(id),
      getMessageSource: () => ({
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        setGuard: () => {},
        receiveMessage: () => Promise.resolve(undefined),
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        redirectBack: () => {},
      }),
      executeTask: async task => {
        this.openTask = true;
        await this.tasks.execute(async () => {
          await task({
            send: (msg: string) => this.connection.send(msg),
            receiveMessage: handler => {
              this.forwardMessageToTask = msg => {
                const result = handler(msg);
                if (!result) {
                  this.messageHandler(msg);
                }
              };
            },
          });
        });

        this.openTask = false;
      },
    };
    return client;
  };

  public disconnect(): void {
    this.connection.close();
  }
}
