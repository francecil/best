/**
 * Chrome Tabs API Procedures
 */

import { mutation, query } from '../core/procedure';

export const tabsProcedures = {
  /**
   * Create a new tab
   */
  create: mutation(async (options: chrome.tabs.CreateProperties) => {
    return chrome.tabs.create(options);
  }),

  /**
   * Get a specific tab
   */
  get: query(async (tabId: number) => {
    return chrome.tabs.get(tabId);
  }),

  /**
   * Query tabs
   */
  query: query(async (queryInfo: chrome.tabs.QueryInfo) => {
    return chrome.tabs.query(queryInfo);
  }),

  /**
   * Update a tab
   */
  update: mutation(async ({
    tabId,
    updateProperties,
  }: {
    tabId: number;
    updateProperties: chrome.tabs.UpdateProperties;
  }) => {
    return chrome.tabs.update(tabId, updateProperties);
  }),

  /**
   * Close a tab
   */
  remove: mutation(async (tabId: number) => {
    await chrome.tabs.remove(tabId);
  }),

  /**
   * Reload a tab
   */
  reload: mutation(async ({
    tabId,
    reloadProperties,
  }: {
    tabId: number;
    reloadProperties?: chrome.tabs.ReloadProperties;
  }) => {
    if (reloadProperties === undefined) {
      await chrome.tabs.reload(tabId);
    }
    else {
      await chrome.tabs.reload(tabId, reloadProperties);
    }
  }),
};
