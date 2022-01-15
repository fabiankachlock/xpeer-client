import { Subscription } from './listener/subscription.js';

export type XPeerError = {
  message: string;
};

export type XPeerState = {
  [key: string]: number | string | boolean | XPeerState | XPeerState[];
};

export type XPeerResponse =
  | XPeerError
  | {
      success: boolean;
    };

export type XPeerCallback<
  T,
  P extends XPeerPeer | XPeerVPeer = XPeerPeer | XPeerVPeer
> = (data: T, peer: P, sub: Subscription) => void;

export interface XPeerMessageHandler {
  guard: (msg: XPeerIncomingMessage) => boolean;
  handler: (msg: XPeerIncomingMessage) => void;
}

// @internal
export interface XPeerOperationalClient {
  peerId: string;
  ping(id: string): Promise<boolean>;
  messageSource: XPeerMessageSource;
  executeTask(
    func: (params: {
      send(message: string): Promise<void>;
      receiveMessage: (
        handler: (message: XPeerIncomingMessage) => boolean
      ) => void;
    }) => Promise<void>
  ): Promise<void>;
}

export interface XPeerPeer {
  readonly id: string;
  readonly isVirtual: boolean;
  ping(): Promise<boolean>;
  sendMessage(msg: string): Promise<XPeerResponse>;
  on(event: 'message', callback: XPeerCallback<string>): Subscription;
  once(event: 'message', callback: XPeerCallback<string>): Subscription;
}

export interface XPeerVPeer<S extends XPeerState = XPeerState>
  extends XPeerPeer {
  readonly isVirtual: true;
  connect(): Promise<XPeerResponse>;
  disconnect(): Promise<void>;
  patchState(state: S): Promise<XPeerResponse>;
  putState(state: S): Promise<XPeerResponse>;

  on(event: 'state', callback: XPeerCallback<S>): Subscription;
  on(event: 'message', callback: XPeerCallback<string>): Subscription;

  once(event: 'state', callback: XPeerCallback<S>): Subscription;
  once(event: 'message', callback: XPeerCallback<string>): Subscription;
}

export interface XPeerMessageSource<T = XPeerIncomingMessage> {
  setGuard(guard: (message: T) => boolean): void;
  setHandler(handler: (message: T) => void): void;
  redirectBack(message: T): void;
  destroy(): void;
}

export interface XPeerClient {
  getPeer(id: string): Promise<XPeerPeer | XPeerVPeer | undefined>;
  ping(id: string): Promise<boolean>;
  disconnect(): void;
}

// @internal
export enum XPeerIncomingMessageType {
  MSG_SEND = 'recvPeer',
  MSG_SUCCESS = 'oprResOk',
  MSG_PING = 'sendPing',
  MSG_PONG = 'sendPong',
  MSG_PEER_ID = 'gPeerCId',
  MSG_ERROR = 'errorMsg',
  MSG_STATE_UPDATE = 'stateMut',
}

// @internal
export enum XPeerOutgoingMessageType {
  OPR_PING = 'sendPing',
  OPR_PONG = 'sendPong',
  OPR_CREATE_V_PEER = 'crtVPeer',
  OPR_DELETE_V_PEER = 'delVPeer',
  OPR_CONNECT_V_PEER = 'conVPeer',
  OPR_DISCONNECT_V_PEER = 'disVPeer',
  OPR_SEND_DIRECT = 'sendPeer',
  OPR_PUT_SHARED_STATE = 'putState',
  OPR_PATCH_SHARED_STATE = 'patState',
}

export type XPeerIncomingMessage = {
  type: XPeerIncomingMessageType;
  sender: string;
  payload: string;
};

// @internal
export enum XPeerEvent {
  message = 'message',
}
