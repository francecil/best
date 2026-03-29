/**
 * Example: Content Script
 * Just call connectBridge() - that's it!
 */

import { connectBridge } from '../connector';

// Connect page and background
connectBridge({
  debug: true,
});

console.log('✅ Bridge connector initialized');
