import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
  },
  resolve: {
    // 开发时优先解析 extension-bridge 的 TypeScript 源码，无需预构建
    conditions: ['source'],
  },
})
