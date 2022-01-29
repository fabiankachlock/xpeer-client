import { Logger } from './helper/logger.js';
import { Client } from './client.js';
import { XPeerClient } from './xpeer.js';

export class XPeer {
  static Logger = Logger;

  static createConnection(serverUrl: string): XPeerClient {
    return new Client(serverUrl);
  }
}
