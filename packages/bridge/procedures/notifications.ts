/**
 * Chrome Notifications API Procedures
 */

import { mutation, query, subscription } from '../core/procedure';

export const notificationsProcedures = {
  /**
   * Create a notification
   */
  create: mutation(async ({
    id,
    options,
  }: {
    id?: string;
    options: chrome.notifications.NotificationCreateOptions;
  }) => {
    return chrome.notifications.create(id ?? '', options);
  }),

  /**
   * Update an existing notification
   */
  update: mutation(async ({
    id,
    options,
  }: {
    id: string;
    options: chrome.notifications.NotificationOptions;
  }) => {
    return chrome.notifications.update(id, options);
  }),

  /**
   * Clear a notification
   */
  clear: mutation(async (id: string) => {
    return chrome.notifications.clear(id);
  }),

  /**
   * Get all notifications
   */
  getAll: query(async () => {
    return chrome.notifications.getAll();
  }),

  /**
   * Subscribe to notification click events
   */
  onClicked: subscription<{ type: 'clicked'; id: string }>((emit) => {
    const handler = (notificationId: string) => {
      emit({ type: 'clicked', id: notificationId });
    };

    chrome.notifications.onClicked.addListener(handler);
    return () => chrome.notifications.onClicked.removeListener(handler);
  }),

  /**
   * Subscribe to notification close events
   */
  onClosed: subscription<{ type: 'closed'; id: string; byUser: boolean }>((emit) => {
    const handler = (notificationId: string, byUser: boolean) => {
      emit({ type: 'closed', id: notificationId, byUser });
    };

    chrome.notifications.onClosed.addListener(handler);
    return () => chrome.notifications.onClosed.removeListener(handler);
  }),
};
