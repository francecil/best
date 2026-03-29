/**
 * Chrome Management API Procedures
 */

import { mutation, query, subscription } from '../core/procedure';

export const managementProcedures = {
  /**
   * Get all installed extensions
   */
  getAll: query(async () => {
    return chrome.management.getAll();
  }),

  /**
   * Get single extension info
   */
  get: query(async (id: string) => {
    return chrome.management.get(id);
  }),

  /**
   * Get current extension info
   */
  getSelf: query(async () => {
    return chrome.management.getSelf();
  }),

  /**
   * Enable/disable an extension
   */
  setEnabled: mutation(async ({ id, enabled }: { id: string; enabled: boolean }) => {
    await chrome.management.setEnabled(id, enabled);
  }),

  /**
   * Uninstall an extension
   */
  uninstall: mutation(async ({
    id,
    showConfirmDialog = true,
  }: {
    id: string;
    showConfirmDialog?: boolean;
  }) => {
    await chrome.management.uninstall(id, { showConfirmDialog });
  }),

  /**
   * Uninstall current extension
   */
  uninstallSelf: mutation(async ({
    showConfirmDialog = true,
  }: {
    showConfirmDialog?: boolean;
  } = {}) => {
    await chrome.management.uninstallSelf({ showConfirmDialog });
  }),

  /**
   * Subscribe to extension changes
   */
  onChanged: subscription<{
    type: 'installed' | 'uninstalled' | 'enabled' | 'disabled';
    data: chrome.management.ExtensionInfo | string;
  }>((emit) => {
    const handlers = {
      installed: (info: chrome.management.ExtensionInfo) => {
        emit({ type: 'installed', data: info });
      },
      uninstalled: (id: string) => {
        emit({ type: 'uninstalled', data: id });
      },
      enabled: (info: chrome.management.ExtensionInfo) => {
        emit({ type: 'enabled', data: info });
      },
      disabled: (info: chrome.management.ExtensionInfo) => {
        emit({ type: 'disabled', data: info });
      },
    };

    chrome.management.onInstalled.addListener(handlers.installed);
    chrome.management.onUninstalled.addListener(handlers.uninstalled);
    chrome.management.onEnabled.addListener(handlers.enabled);
    chrome.management.onDisabled.addListener(handlers.disabled);

    // Cleanup
    return () => {
      chrome.management.onInstalled.removeListener(handlers.installed);
      chrome.management.onUninstalled.removeListener(handlers.uninstalled);
      chrome.management.onEnabled.removeListener(handlers.enabled);
      chrome.management.onDisabled.removeListener(handlers.disabled);
    };
  }),
};
