import { createBridge, defaultRouter } from 'extension-bridge';

export default defineBackground(() => {
  console.log('Pedestal background starting...', { id: browser.runtime.id });

  const bridge = createBridge(defaultRouter, { debug: true });
  bridge.listen();

  console.log('Pedestal background ready');
});
