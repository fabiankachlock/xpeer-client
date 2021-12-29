import {
  XPeerIncomingMessage,
  XPeerIncomingMessageType,
  XPeerOutgoingMessageType,
} from '../xpeer.js';

export class XPeerMessageParser {
  private static readonly messageRegex =
    /^(?<type>.{8})::(?<sender>.{22})::(?<payload>.*)/;

  static parse(msg: string): XPeerIncomingMessage {
    const match = this.messageRegex.exec(msg);

    return {
      sender: match?.groups?.sender ?? '',
      type: (match?.groups?.type ?? '') as XPeerIncomingMessageType,
      payload: match?.groups?.payload ?? '',
    };
  }
}

export class XPeerMessageParsingInterceptor {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private _messageForwarder: (msg: XPeerIncomingMessage) => void = () => {};

  constructor(callback: (msg: XPeerIncomingMessage) => void) {
    this._messageForwarder = callback;
  }

  public callback = (message: string): void => {
    const parsed = XPeerMessageParser.parse(message);
    this._messageForwarder(parsed);
  };

  public static messageForwarder(
    callback: (msg: XPeerIncomingMessage) => void
  ): XPeerMessageParsingInterceptor {
    return new XPeerMessageParsingInterceptor(callback);
  }
}

export class XPeerMessageBuilder {
  static create(
    type: XPeerOutgoingMessageType,
    target: string,
    payload: string
  ): string {
    return `${type}::${target}::${payload}`;
  }
}
