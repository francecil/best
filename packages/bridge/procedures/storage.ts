/**
 * Chrome Storage API Procedures
 */

import { mutation, query, subscription } from '../core/procedure';

export const storageProcedures = {
  local: {
    /**
     * Get items from local storage
     */
    get: query(async (keys?: string | string[] | Record<string, unknown>) => {
      return chrome.storage.local.get(keys as string | string[]);
    }),

    /**
     * Set items in local storage
     */
    set: mutation(async (items: Record<string, unknown>) => {
      await chrome.storage.local.set(items);
    }),

    /**
     * Remove items from local storage
     */
    remove: mutation(async (keys: string | string[]) => {
      await chrome.storage.local.remove(keys);
    }),

    /**
     * Clear local storage
     */
    clear: mutation(async () => {
      await chrome.storage.local.clear();
    }),
  },

  sync: {
    /**
     * Get items from sync storage
     */
    get: query(async (keys?: string | string[] | Record<string, unknown>) => {
      return chrome.storage.sync.get(keys as string | string[]);
    }),

    /**
     * Set items in sync storage
     */
    set: mutation(async (items: Record<string, unknown>) => {
      await chrome.storage.sync.set(items);
    }),

    /**
     * Remove items from sync storage
     */
    remove: mutation(async (keys: string | string[]) => {
      await chrome.storage.sync.remove(keys);
    }),

    /**
     * Clear sync storage
     */
    clear: mutation(async () => {
      await chrome.storage.sync.clear();
    }),
  },

  /**
   * Subscribe to storage changes across all areas
   */
  onChanged: subscription<{
    changes: Record<string, chrome.storage.StorageChange>;
    areaName: string;
  }>((emit) => {
    const handler = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      emit({ changes, areaName });
    };

    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }),
};
