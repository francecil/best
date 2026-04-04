/**
 * Test extension Content Script
 * Zero-config connector — relays MessagePort between page and Service Worker.
 */

import { connectBridge } from '../../../connector';

connectBridge({ debug: true });
