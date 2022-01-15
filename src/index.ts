import { Client } from 'client.js';
import { XPeerClient } from './xpeer.js';

export class XPeer {
  static createConnection(serverUrl: string): XPeerClient {
    return new Client(serverUrl);
  }
}
