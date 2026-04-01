/**
 * Chrome Runtime API Procedures
 */

import { mutation, query } from '../core/procedure';

export const runtimeProcedures = {
  /**
   * Get the extension manifest
   */
  getManifest: query(async () => {
    return chrome.runtime.getManifest();
  }),

  /**
   * Get a full URL for a resource within the extension
   */
  getURL: query(async (path: string) => {
    return chrome.runtime.getURL(path);
  }),

  /**
   * Get information about the current platform
   */
  getPlatformInfo: query(async () => {
    return chrome.runtime.getPlatformInfo();
  }),

  /**
   * Send a message to the extension or another extension
   */
  sendMessage: mutation(async ({
    extensionId,
    message,
  }: {
    extensionId?: string;
    message: unknown;
  }) => {
    if (extensionId) {
      return chrome.runtime.sendMessage(extensionId, message);
    }
    return chrome.runtime.sendMessage(message);
  }),

  /**
   * Reload the extension
   */
  reload: mutation(async () => {
    chrome.runtime.reload();
  }),
};
