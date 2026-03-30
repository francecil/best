import { connectBridge } from 'extension-bridge/connector';

export default defineContentScript({
  matches: [
    'http://127.0.0.1:8765/*',
    'http://localhost:5173/*',
    'http://127.0.0.1:5173/*',
  ],
  runAt: 'document_start',
  main() {
    connectBridge({ debug: true });
  },
});
