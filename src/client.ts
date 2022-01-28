import { Peer } from './peer.js';
import { Awaiter } from './helper/awaiter.js';
import { TaskQueue } from './helper/queue.js';
import { WSConnection } from './ws/connection.js';
import {
  XPeerMessageBuilder,
  XPeerMessageParsingInterceptor,
} from './ws/messages.js';
import {
  XPeerPeer,
  XPeerClient,
  XPeerIncomingMessage,
  XPeerIncomingMessageType,
  XPeerMessageHandler,
  XPeerOperationalClient,
  XPeerOutgoingMessageType,
  XPeerVPeer,
  XPeerValueResponse,
} from './xpeer.js';
import { MessageDistributer } from './listener/messageDistributer.js';
import { Logger } from './helper/logger.js';
import { VPeer } from './vpeer.js';

const DEFAULT_PEER_ID = '<<<no-peer-id>>>';

export class Client implements XPeerClient {
  private connection: WSConnection;

  private tasksQueue = new TaskQueue();

  private peerId = DEFAULT_PEER_ID;

  private hasOpenTask = false;

  private internalMessageHandlers: XPeerMessageHandler[];

  private messageDistributer: MessageDistributer<XPeerIncomingMessage>;

  constructor(public readonly serverUrl: string) {
    this.connection = new WSConnection(serverUrl);
    this.connection.messageForwarder =
      XPeerMessageParsingInterceptor.messageForwarder(
        this.rootIncomingMessageHandler
      ).callback;

    this.internalMessageHandlers = [
      this._idMessageHandler,
      this._pingMessageHandler,
      this._messageMessageHandler,
      this._defaultMessageHandler,
    ];

    this.messageDistributer = new MessageDistributer(
      this._defaultMessageHandler.handler
    );
  }

  private rootIncomingMessageHandler = (message: XPeerIncomingMessage) => {
    Logger.Client.debug('distributing:', message);
    if (this.hasOpenTask) {
      Logger.Client.debug('forwarding to task');
      this.forwardMessageToTask(message);
    } else {
      this.messageHandler(message);
    }
  };

  private forwardMessageToTask: (message: XPeerIncomingMessage) => void =
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    () => {};

  private messageHandler(message: XPeerIncomingMessage) {
    Logger.Client.debug('message in handler');
    for (const handler of this.internalMessageHandlers) {
      if (handler.guard(message)) {
        handler.handler(message);
        break;
      }
    }
  }

  private _defaultMessageHandler: XPeerMessageHandler = {
    // handle incoming messages
    guard: () => true,
    handler: message =>
      Logger.Default.log(
        `[DefaultHandler] [${message.sender}] received ${message.payload}`
      ),
  };

  private _messageMessageHandler: XPeerMessageHandler = {
    // handle incoming messages
    guard: message => message.type === XPeerIncomingMessageType.MSG_SEND,
    handler: message => this.messageDistributer.distribute(message),
  };

  private _pingMessageHandler: XPeerMessageHandler = {
    // handle incoming pings
    guard: message => message.type === XPeerIncomingMessageType.MSG_PING,
    handler: message => {
      Logger.Client.debug(`received ping from ${message.sender} sending pong`);
      // this doesn't has to be executed on task queue, because it doesn't get a response
      this.connection.send(
        XPeerMessageBuilder.create(
          XPeerOutgoingMessageType.OPR_PONG,
          message.sender,
          ''
        )
      );
    },
  };

  private _idMessageHandler: XPeerMessageHandler = {
    // handle id assignment
    guard: message =>
      message.type === XPeerIncomingMessageType.MSG_PEER_ID &&
      message.sender === message.payload &&
      message.sender !== this.peerId,
    handler: message => {
      Logger.Client.debug(`received id: ${message.payload}`);
      this.peerId = message.payload;
    },
  };

  public async ping(id: string): Promise<boolean> {
    return (await this._ping(id)).success;
  }

  private async _ping(
    id: string
  ): Promise<{ success: boolean; payload: string }> {
    let foundPeer = false;
    let payload = '';
    this.hasOpenTask = true;
    await this.tasksQueue.execute(async () => {
      const awaiter = new Awaiter();
      Logger.Client.debug(`sending ping to ${id}`);
      await this.connection.send(
        XPeerMessageBuilder.create(XPeerOutgoingMessageType.OPR_PING, id, '')
      );

      this.forwardMessageToTask = message => {
        if (
          message.type === XPeerIncomingMessageType.MSG_PONG &&
          message.sender === id
        ) {
          Logger.Client.debug(`ping ok ${id}`);
          foundPeer = true;
          payload = message.payload;
          awaiter.callback({});
        } else if (
          message.type === XPeerIncomingMessageType.MSG_ERROR &&
          message.sender === this.peerId
        ) {
          Logger.Client.error(message.payload);
          awaiter.callback({});
        } else {
          Logger.Client.debug('redirect message back');
          this.messageHandler(message);
        }
      };
      await awaiter.promise;
      this.hasOpenTask = false;
    });
    return {
      success: foundPeer,
      payload,
    };
  }

  public async getPeer(
    id: string
  ): Promise<XPeerPeer | XPeerVPeer | undefined> {
    const response = await this._ping(id);
    if (response.success && response.payload === 'virtual') {
      return new VPeer(id, this.createOperationalClient());
    } else if (response.success) {
      return new Peer(id, this.createOperationalClient());
    }
    return undefined;
  }

  private createOperationalClient = (): XPeerOperationalClient => {
    const client: XPeerOperationalClient = {
      peerId: this.peerId,
      messageSource: this.messageDistributer.createMessageSource(),
      ping: (id: string) => this.ping(id),
      executeTask: async task => {
        this.hasOpenTask = true;
        await this.tasksQueue.execute(async () => {
          await task({
            send: (msg: string) => this.connection.send(msg),
            receiveMessage: handler => {
              this.forwardMessageToTask = msg => {
                const result = handler(msg);
                if (!result) {
                  Logger.Client.debug('redirect message back');
                  this.messageHandler(msg);
                }
              };
            },
          });
        });
        this.hasOpenTask = false;
      },
    };
    return client;
  };

  public async createVPeer(): Promise<XPeerValueResponse<string>> {
    let vpeerId = '';
    let error: string | undefined = undefined;
    this.hasOpenTask = true;
    await this.tasksQueue.execute(async () => {
      const awaiter = new Awaiter();
      Logger.Client.debug('creating vpeer');
      await this.connection.send(
        XPeerMessageBuilder.create(
          XPeerOutgoingMessageType.OPR_CREATE_V_PEER,
          this.peerId,
          ''
        )
      );

      this.forwardMessageToTask = message => {
        if (
          message.type === XPeerIncomingMessageType.MSG_PEER_ID &&
          message.sender !== message.payload
        ) {
          Logger.Client.debug(`created ${message.payload}`);
          vpeerId = message.payload;
          awaiter.callback({});
        } else if (
          message.type === XPeerIncomingMessageType.MSG_ERROR &&
          message.sender === this.peerId
        ) {
          Logger.Client.error(message.payload);
          error = message.payload;
          awaiter.callback({});
        } else {
          Logger.Client.debug('redirect message back');
          this.messageHandler(message);
        }
      };
      await awaiter.promise;
      this.hasOpenTask = false;
    });
    return error
      ? {
          message: error,
        }
      : {
          payload: vpeerId,
        };
  }

  public disconnect(): void {
    this.connection.close();
  }
}
