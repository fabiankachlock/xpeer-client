import { XPeerResponse } from 'xpeer';

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
