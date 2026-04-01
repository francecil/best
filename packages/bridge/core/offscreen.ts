/**
 * Chrome Offscreen API helpers for loading resources that require a Blink
 * rendering context (e.g. chrome://extension-icon/ URLs).
 *
 * Service workers cannot fetch chrome:// URLs directly — only documents
 * running in a Blink renderer can load them.  The solution is to create an
 * offscreen document, ask it to load the image with an <img> element, and
 * return the pixel data as a base64 data URL via canvas.toDataURL().
 *
 * Usage
 * -----
 * Service worker side (bridge procedure):
 *   const dataUrl = await fetchDataUrlViaOffscreen('chrome://extension-icon/…')
 *
 * Offscreen document side (call once on startup):
 *   registerOffscreenHandler()
 */

const MSG_TYPE = 'bridge:offscreen:fetch-data-url';

/**
 * Ensure the offscreen document is alive, then ask it to load the given URL
 * as an <img> and return a base64 data URL.  Must be called from a service
 * worker context that has the "offscreen" permission.
 */
export async function fetchDataUrlViaOffscreen(url: string): Promise<string> {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');

  // createDocument throws if a document already exists; ignore that error.
  try {
    await chrome.offscreen.createDocument({
      url: offscreenUrl,
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: 'Load extension-icon URLs as data URLs for web page display',
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (!msg.includes('Only a single offscreen document')) throw e;
  }

  return new Promise<string>((resolve, reject) => {
    chrome.runtime.sendMessage({ type: MSG_TYPE, url }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.error) {
        reject(new Error(response.error as string));
        return;
      }
      resolve(response.dataUrl as string);
    });
  });
}

/**
 * Register the message handler inside the offscreen document.
 * Call this once when the offscreen document starts.
 */
export function registerOffscreenHandler(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MSG_TYPE) {
      return false;
    };

    const url = message.url as string;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 48;
      canvas.height = img.naturalHeight || 48;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      sendResponse({ dataUrl: canvas.toDataURL('image/png') });
    };

    img.onerror = () => {
      sendResponse({ error: `Failed to load image: ${url}` });
    };

    img.src = url;
    return true; // keep message channel open for async sendResponse
  });
}
