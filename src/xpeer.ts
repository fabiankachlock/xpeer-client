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

export type XPeerCallback<T, P extends XPeer | XVPeer = XPeer | XVPeer> = (
  data: T,
  peer: P
) => void;

export interface XPeerMessageHandler {
  guard: (msg: XPeerIncomingMessage) => boolean;
  handler: (msg: XPeerIncomingMessage) => void;
}

export interface XPeerOperationalClient {
  peerId: string;
  ping(id: string): Promise<boolean>;
  send(message: string): Promise<void>;
  getMessageSource(id: string): XPeerMessageSource;
  executeTask(
    func: (params: {
      receiveMessage: (
        handler: (message: XPeerIncomingMessage) => boolean
      ) => void;
    }) => Promise<void>
  ): Promise<void>;
}

export interface XPeer {
  readonly id: string;
  readonly isVirtual: boolean;
  ping(): Promise<boolean>;
  sendMessage(msg: string): Promise<XPeerResponse>;
  // on(event: 'message', callback: XPeerCallback<string>): void;
  // once(event: 'message', callback: XPeerCallback<string>): void;
}

export interface XVPeer<S extends XPeerState = XPeerState> extends XPeer {
  readonly isVirtual: true;
  connect(): Promise<XPeerResponse>;
  disconnect(): Promise<void>;
  patchState(state: S): Promise<XPeerResponse>;
  putState(state: S): Promise<XPeerResponse>;

  // on(event: 'state', callback: XPeerCallback<S>): void;
  // on(event: 'message', callback: XPeerCallback<string>): void;

  // once(event: 'state', callback: XPeerCallback<S>): void;
  // once(event: 'message', callback: XPeerCallback<string>): void;
}

export interface XPeerMessageSource {
  setGuard(guard: (message: XPeerIncomingMessage) => boolean): void;
  receiveMessage(): Promise<
    | {
        message: XPeerIncomingMessage;
        wasLast: boolean;
      }
    | undefined
  >;
  redirectBack(message: XPeerIncomingMessage): void;
}

export enum XPeerIncomingMessageType {
  MSG_SEND = 'recvPeer',
  MSG_SUCCESS = 'oprResOk',
  MSG_PING = 'sendPing',
  MSG_PONG = 'sendPong',
  MSG_PEER_ID = 'gPeerCId',
  MSG_ERROR = 'errorMsg',
  MSG_STATE_UPDATE = 'stateMut',
}

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
