/**
 * Bridge Connector (Content Script)
 * Automatically bridges Page <-> Service Worker
 */

import { createLogger } from "../utils/logger";
import { getDelay } from "../utils/retry";

interface ConnectorOptions {
  debug?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

export function connectBridge(options: ConnectorOptions = {}) {
  const debug = options.debug ?? false;
  const maxRetries = options.maxRetries ?? 5;
  const baseRetryDelay = options.retryDelay ?? 1000;
  const logger = createLogger('Bridge Connector', debug);

  logger.info('Initializing...');

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
      logger.info('Connection request received');

      let retryCount = 0;

      const attemptConnect = () => {
        try {
          // Create MessageChannel
          const channel = new MessageChannel();

          // Connect to Service Worker via runtime.connect
          const backgroundPort = chrome.runtime.connect({ name: 'bridge' });

          logger.info('Connected to background');

          // Reset retry count on successful connection
          retryCount = 0;

          // Forward messages: Page -> Background
          channel.port1.onmessage = (e) => {
            logger.debug('Page → Background:', e.data);
            backgroundPort.postMessage(e.data);
          };

          // Forward messages: Background -> Page
          backgroundPort.onMessage.addListener((msg) => {
            logger.debug('Background → Page:', msg);
            channel.port1.postMessage(msg);
          });

          // Handle disconnect with retry logic
          backgroundPort.onDisconnect.addListener(() => {
            logger.info('Background disconnected');
            channel.port1.close();

            // Attempt reconnection if there's an error and retries remaining
            if (chrome.runtime.lastError && retryCount < maxRetries) {
              retryCount++;
              const delay = getDelay({ delay: baseRetryDelay, backoff: 'exponential', maxDelay: 10000 }, retryCount);
              logger.info(`Reconnecting in ${delay}ms (attempt ${retryCount}/${maxRetries})...`);

              setTimeout(() => {
                attemptConnect();
              }, delay);
            }
            else if (retryCount >= maxRetries) {
              logger.warn(`Max retries (${maxRetries}) reached, giving up`);
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

          logger.info('Connection established');
        }
        catch (error) {
          logger.error('Connection failed:', error);

          // Retry if we haven't exceeded max attempts
          if (retryCount < maxRetries) {
            retryCount++;
            const delay = getDelay({ delay: baseRetryDelay, backoff: 'exponential', maxDelay: 10000 }, retryCount);
            logger.warn(`Retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})...`);

            setTimeout(() => {
              attemptConnect();
            }, delay);
          }
          else {
            logger.warn(`Max retries (${maxRetries}) reached, giving up`);
          }
        }
      };

      // Start connection attempt
      attemptConnect();
    }
  });

  logger.info('Connector ready');
}
