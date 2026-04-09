import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Pedestal Extension',
    permissions: ['management', 'cookies', 'storage', 'offscreen', 'debugger'],
    host_permissions: ['<all_urls>'],
  },
  vite: () => ({
    resolve: {
      // 优先解析 workspace 包的 TypeScript 源码，开发时无需预构建
      conditions: ['source'],
    },
  }),
});
