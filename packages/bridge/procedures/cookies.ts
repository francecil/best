/**
 * Chrome Cookies API Procedures
 */

import { mutation, query, subscription } from '../core/procedure';

export const cookiesProcedures = {
  /**
   * Get a single cookie
   */
  get: query(async (details: chrome.cookies.CookieDetails) => {
    return chrome.cookies.get(details);
  }),

  /**
   * Get all cookies matching filter
   */
  getAll: query(async (details: chrome.cookies.GetAllDetails) => {
    return chrome.cookies.getAll(details);
  }),

  /**
   * Set a cookie
   */
  set: mutation(async (details: chrome.cookies.SetDetails) => {
    return chrome.cookies.set(details);
  }),

  /**
   * Remove a cookie
   */
  remove: mutation(async (details: chrome.cookies.CookieDetails) => {
    return chrome.cookies.remove(details);
  }),

  /**
   * Subscribe to cookie changes
   */
  onChanged: subscription<chrome.cookies.CookieChangeInfo>((emit) => {
    const handler = (changeInfo: chrome.cookies.CookieChangeInfo) => {
      emit(changeInfo);
    };

    chrome.cookies.onChanged.addListener(handler);
    return () => chrome.cookies.onChanged.removeListener(handler);
  }),
};
