/**
 * Vitest Global Setup
 *
 * 在 e2e 测试前自动完成：
 * 1. wxt build — 构建扩展到 .output/chrome-mv3
 * 2. 启动静态文件服务器（127.0.0.1:8765）
 *
 * 测试结束后自动关闭服务器。
 */

import { spawnSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const EXTENSION_PATH = resolve(ROOT, '.output/chrome-mv3')
const SERVER_URL = 'http://127.0.0.1:8765'

export default async function setup(): Promise<() => Promise<void>> {
  // 构建扩展
  console.log('\n[global-setup] Building extension...')
  const result = spawnSync('pnpm', ['build'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  })
  if (result.status !== 0) {
    throw new Error('[global-setup] Extension build failed')
  }

  // 启动静态文件服务器
  const server = spawnServer(EXTENSION_PATH)

  // 等待服务器就绪
  await waitForServer(SERVER_URL)
  console.log(`[global-setup] Test server ready at ${SERVER_URL}\n`)

  return async () => {
    server.kill('SIGTERM')
    console.log('\n[global-setup] Test server stopped')
  }
}

function spawnServer(serveDir: string): ChildProcess {
  return spawn('pnpm', ['exec', 'serve', serveDir, '-l', 'tcp://127.0.0.1:8765'], {
    cwd: ROOT,
    stdio: 'pipe',
    shell: true,
  })
}

async function waitForServer(url: string, timeout = 15_000): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      await fetch(url)
      return
    } catch {
      await new Promise(r => setTimeout(r, 300))
    }
  }
  throw new Error(`[global-setup] Server did not start within ${timeout}ms`)
}
