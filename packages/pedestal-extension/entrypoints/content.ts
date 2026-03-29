import { connectBridge } from 'extension-bridge/connector';

export default defineContentScript({
  matches: ['http://127.0.0.1:8765/*', 'https://127.0.0.1:8765/*'],
  runAt: 'document_start',
  main() {
    connectBridge({ debug: true });
  },
});
