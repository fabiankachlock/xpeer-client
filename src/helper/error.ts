import { XPeerResponse } from '../xpeer.js';

// @internal
export const createXPeerResponse = (error?: string): XPeerResponse => {
  if (error) {
    return {
      message: error,
    };
  }
  return {
    success: true,
  };
};
