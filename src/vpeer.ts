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

  private _state: S | undefined = undefined;

  get currentState(): S | undefined {
    return this._state;
  }

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
      this.setState(JSON.parse(message.payload));
    }
  };

  private setState(state: S): void {
    this._state = state;
    this.listenerManager.trigger(XPeerEvent.stateUpdate, this._state, this);
  }

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

  public async connect(): Promise<XPeerResponse> {
    let error: string | undefined = undefined;
    this.logger.debug('connecting');
    await this.client.executeTask(async ({ receiveMessage, send }) => {
      const awaiter = new Awaiter();
      await send(
        XPeerMessageBuilder.create(
          XPeerOutgoingMessageType.OPR_CONNECT_V_PEER,
          this.id,
          ''
        )
      );

      receiveMessage(message => {
        if (
          message.type === XPeerIncomingMessageType.MSG_STATE_UPDATE &&
          message.sender === this.id
        ) {
          this.logger.debug('connect successful');
          this.setState(JSON.parse(message.payload));
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

  public async disconnect(): Promise<XPeerResponse> {
    this.logger.debug('disconnecting');
    this.listenerManager.clearAllListeners();
    return await this.sendWebsocketMessage(
      XPeerOutgoingMessageType.OPR_DISCONNECT_V_PEER,
      ''
    );
  }

  public async patchState(state: S): Promise<XPeerResponse> {
    this.logger.debug('patching state');
    return await this.sendWebsocketMessage(
      XPeerOutgoingMessageType.OPR_PATCH_SHARED_STATE,
      JSON.stringify(state)
    );
  }

  public async putState(state: S): Promise<XPeerResponse> {
    this.logger.debug('putting state');
    return await this.sendWebsocketMessage(
      XPeerOutgoingMessageType.OPR_PUT_SHARED_STATE,
      JSON.stringify(state)
    );
  }

  public destroy(): void {
    this.listenerManager.clearAllListeners();
    this.client.executeTask(async ({ send }) => {
      await send(
        XPeerMessageBuilder.create(
          XPeerOutgoingMessageType.OPR_DELETE_V_PEER,
          this.id,
          ''
        )
      );
    });
  }

  private async sendWebsocketMessage(
    type: XPeerOutgoingMessageType,
    payload: string
  ): Promise<XPeerResponse> {
    let error: string | undefined = undefined;
    await this.client.executeTask(async ({ receiveMessage, send }) => {
      const awaiter = new Awaiter();
      await send(XPeerMessageBuilder.create(type, this.id, payload));

      receiveMessage(message => {
        if (
          message.type === XPeerIncomingMessageType.MSG_SUCCESS &&
          message.sender === this.id
        ) {
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
