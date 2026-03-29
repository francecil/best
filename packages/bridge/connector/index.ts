/**
 * Bridge Connector (Content Script)
 * Automatically bridges Page <-> Service Worker
 */

interface ConnectorOptions {
  debug?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

export function connectBridge(options: ConnectorOptions = {}) {
  const debug = options.debug ?? false;
  const maxRetries = options.maxRetries ?? 5;
  const baseRetryDelay = options.retryDelay ?? 1000;

  const log = (...args: any[]) => {
    if (debug) {
      console.log('[Bridge Connector]', ...args);
    }
  };

  log('Initializing...');

  // ========================================
  // 1. Listen for connection request from page
  // ========================================

  window.addEventListener('message', (event) => {
    // Only accept messages from same window
    if (event.source !== window) {
      return;
    }

    const message = event.data;

    if (message?.type === 'bridge:connect') {
      log('Connection request received');

      let retryCount = 0;

      const attemptConnect = () => {
        try {
          // Create MessageChannel
          const channel = new MessageChannel();

          // Connect to Service Worker via runtime.connect
          const backgroundPort = chrome.runtime.connect({ name: 'bridge' });

          log('Connected to background');

          // Reset retry count on successful connection
          retryCount = 0;

          // Forward messages: Page -> Background
          channel.port1.onmessage = (e) => {
            log('Page → Background:', e.data);
            backgroundPort.postMessage(e.data);
          };

          // Forward messages: Background -> Page
          backgroundPort.onMessage.addListener((msg) => {
            log('Background → Page:', msg);
            channel.port1.postMessage(msg);
          });

          // Handle disconnect with retry logic
          backgroundPort.onDisconnect.addListener(() => {
            log('Background disconnected');
            channel.port1.close();

            // Attempt reconnection if there's an error and retries remaining
            if (chrome.runtime.lastError && retryCount < maxRetries) {
              retryCount++;
              const delay = Math.min(baseRetryDelay * 2 ** (retryCount - 1), 10000);
              log(`Reconnecting in ${delay}ms (attempt ${retryCount}/${maxRetries})...`);

              setTimeout(() => {
                attemptConnect();
              }, delay);
            }
            else if (retryCount >= maxRetries) {
              log(`Max retries (${maxRetries}) reached, giving up`);
            }
          });

          // Send port to page with strict origin
          window.postMessage(
            {
              type: 'bridge:init',
              port: channel.port2,
            },
            window.location.origin,
            [channel.port2],
          );

          log('Connection established');
        }
        catch (error) {
          log('Connection failed:', error);

          // Retry if we haven't exceeded max attempts
          if (retryCount < maxRetries) {
            retryCount++;
            const delay = Math.min(baseRetryDelay * 2 ** (retryCount - 1), 10000);
            log(`Retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})...`);

            setTimeout(() => {
              attemptConnect();
            }, delay);
          }
          else {
            log(`Max retries (${maxRetries}) reached, giving up`);
          }
        }
      };

      // Start connection attempt
      attemptConnect();
    }
  });

  log('Connector ready');
}
