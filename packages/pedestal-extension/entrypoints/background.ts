import { createBridge } from 'extension-bridge';

import { pedestalBridgeRouter } from '../lib/bridge-router';

export default defineBackground(() => {
  console.log('Pedestal background starting...', { id: browser.runtime.id });

  const bridge = createBridge(pedestalBridgeRouter, { debug: true });
  bridge.listen();

  console.log('Pedestal background ready');
});
