# extension-bridge

[![npm version](https://img.shields.io/npm/v/extension-bridge.svg)](https://www.npmjs.com/package/extension-bridge)
[![license](https://img.shields.io/npm/l/extension-bridge.svg)](LICENSE)

浏览器扩展 Bridge：让**普通网页**在受控前提下通过扩展进程调用 `chrome.*` API（MV3 Service Worker 环境），并支持将扩展侧事件推回页面。

## ✨ 特性

- 🔐 **安全可靠**: 多层验证、白名单机制、权限控制
- 🚀 **开箱即用**: 简洁的 API，完整的文档和示例
- 📦 **类型安全**: 完整的 TypeScript 类型定义
- 🔄 **双向通信**: 支持 API 调用和事件推送
- ⚡ **性能优化**: 请求去重、结果缓存、批量处理
- 🎯 **框架友好**: 支持 React、Vue 等主流框架

## 📦 安装

```bash
npm install extension-bridge
# 或
pnpm add extension-bridge
```

## 🚀 快速开始

### 最小化示例

#### 1. Service Worker (background.ts)

```typescript
import { createBridge } from 'extension-bridge';
import { managementProcedures } from 'extension-bridge'

export const bridge = createBridge({
  extensions: managementProcedures
}, { debug: true });

export type AppBridge = typeof bridge;

bridge.listen();
```

#### 2. Content Script (content-script.ts)

```typescript
import { connectBridge } from 'extension-bridge'

connectBridge({ debug: true });
```

#### 3. Web Page (page.ts)

```typescript
import type { AppBridge } from './background';
import { createClient } from 'extension-bridge'

const bridge = createClient<AppBridge>();
await bridge.$waitForReady();

// 使用 - 完全类型安全
const extensions = await bridge.extensions.getAll();
```

#### 4. Manifest

```json
{
  "manifest_version": 3,
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["https://your-domain.com/*"],
    "js": ["content-script.js"],
    "run_at": "document_start"
  }],
  "permissions": ["management", "tabs"]
}
```

---

## 📖 文档

| 文档 | 说明 | 适合 |
|-----|------|------|
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | 完整使用指南和架构设计 | 所有人 ⭐ |
| **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** | 实施计划和后续工作 | 贡献者 |

## 🎯 核心特性

### 类型安全的 RPC

参考 tRPC 设计，提供端到端类型安全：

```typescript
// Service Worker - 定义 API
const bridge = createBridge({
  extensions: {
    getAll: query(async () => chrome.management.getAll())
    //                        ^^^^^^^^^^^^^^^^^^^^^^^^
    //                        返回类型自动推导
  }
});

export type AppBridge = typeof bridge;

// 客户端 - 完全类型安全
const client = createClient<AppBridge>();
const extensions = await client.extensions.getAll();
//    ^? ExtensionInfo[] - 自动推导
```

### 可靠通信 (MessageChannel)

使用 MessageChannel 替代传统 postMessage：

- ✅ **点对点通信** - 隔离干扰，不会误收其他消息
- ✅ **可靠送达** - 确认机制，不会丢失消息
- ✅ **双向流式** - 支持实时事件订阅

### 零配置 Content Script

只需一行代码：

```typescript
import { connectBridge } from 'extension-bridge'

connectBridge(); // 完成！自动处理所有通信细节
```

### Procedures 语义化

```typescript
// Query - 读取操作
query(async () => chrome.management.getAll());

// Mutation - 变更操作
mutation(async ({ id, enabled }) => {
  await chrome.management.setEnabled(id, enabled);
});

// Subscription - 实时事件
subscription((emit) => {
  const handler = info => emit(info);
  chrome.management.onInstalled.addListener(handler);
  return () => chrome.management.onInstalled.removeListener(handler);
});
```

---

## 📐 架构设计

### 通信流程

```
┌─────────────┐   MessageChannel    ┌──────────────────┐   runtime.connect    ┌────────────────┐
│  Web Page   │ ←─────────────────→ │ Content Script   │ ←──────────────────→ │ Service Worker │
│   Client    │   JSON-RPC 2.0      │   Connector      │   JSON-RPC 2.0       │     Bridge     │
└─────────────┘                     └──────────────────┘                      └────────────────┘
```

### 核心模块

| 模块 | 职责 | 位置 |
|-----|------|------|
| **Bridge** | 处理 RPC 请求，执行 Chrome API，管理订阅 | Service Worker |
| **Client** | 发起 RPC 请求，接收事件推送 | Web Page |
| **Connector** | 双向转发 MessageChannel ↔ runtime.Port | Content Script |
| **Procedures** | 内置 Chrome API 封装 (management/tabs/...) | 共享 |

### 消息协议 (JSON-RPC 2.0)

**请求**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "extensions.getAll",
  "params": null
}
```

**响应**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": []
}
```

**事件通知**:
```json
{
  "jsonrpc": "2.0",
  "method": "$subscription:12345",
  "params": { "type": "installed", "data": {} }
}
```

---

## 🔐 安全机制

Bridge 遵循最小权限原则：

- ✅ **不绕过 Chrome 权限模型** - 仍需在 manifest.json 声明权限
- ✅ **来源验证** - 可通过中间件配置 allowedOrigins 白名单
- ✅ **API 白名单** - 只暴露明确定义的 Procedures
- ✅ **类型安全** - 编译时检查，减少运行时错误

---

## 🛡️ 中间件 (Middleware)

中间件采用 Koa 风格的洋葱模型，在请求前/后运行拦截器，支持认证、限流、日志等场景。

### 内置中间件

```typescript
import { createBridge, validateOrigin, rateLimit, createLoggerMiddleware } from 'extension-bridge';

const bridge = createBridge(router, {
  // 通过 option 启用内置 logger 中间件（最外层，自动注入）
  logger: { level: 'debug' },
});

// 来源白名单验证（ServerMiddleware，可访问 ctx.port）
bridge.use(validateOrigin(['https://example.com', 'https://app.example.com']));

// 限流：每分钟最多 100 次请求（ServerMiddleware）
bridge.use(rateLimit({ window: 60_000, max: 100 }));

bridge.listen();
```

客户端同样支持 `logger` 选项：

```typescript
import { createClient } from 'extension-bridge';

const client = createClient({
  logger: { level: 'debug' },  // 启用请求/响应日志
  retry: { attempts: 3, delay: 500, backoff: 'exponential' },
});
```

### Middleware vs ServerMiddleware

| | `Middleware` | `ServerMiddleware` |
|---|---|---|
| 适用范围 | Bridge (server) + Client 均可 | 仅 Bridge (server) |
| Context 类型 | `BaseContext` | `BridgeContext`（含 `ctx.port`） |
| 典型场景 | 日志、重试、通用请求变换 | 来源验证、连接级限流 |

```typescript
import type { Middleware, ServerMiddleware } from 'extension-bridge';

// 通用中间件 — 可用于 bridge.use() 或 client 的内置 pipeline
const timing: Middleware = async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`${ctx.req.method} took ${Date.now() - start}ms`);
};

// Server 专属中间件 — 可访问 ctx.port（chrome.runtime.Port）
const auth: ServerMiddleware = async (ctx, next) => {
  const origin = ctx.port.sender?.origin;
  if (origin !== 'https://example.com') {
    throw new BridgeError(JsonRpcErrorCode.Forbidden, `Origin not allowed: ${origin}`);
  }
  await next();
};

bridge.use(timing);
bridge.use(auth);
```

### 中间件类型

```typescript
// 通用：BaseContext 是 server 和 client 共享的字段
type Middleware = (ctx: BaseContext, next: Next) => Promise<void>;

interface BaseContext {
  req: JsonRpcRequest;          // 请求（next() 前可修改）
  res: JsonRpcResponse | undefined; // 响应（next() 后可读/修改）
  startTime: number;            // 请求时间戳 ms
}

// Server 专属：在 BaseContext 基础上增加 port
type ServerMiddleware = (ctx: BridgeContext, next: Next) => Promise<void>;

interface BridgeContext extends BaseContext {
  port: chrome.runtime.Port;   // 发起请求的 content script 连接
}
```

---

## 🔁 重试机制 (Retry)

客户端自动重试失败的请求：

```typescript
import { createClient } from 'extension-bridge';

const bridge = createClient({
  retry: {
    attempts: 3,          // 额外重试次数（默认 0 = 不重试）
    delay: 500,           // 基础延迟 ms
    backoff: 'exponential', // 'linear' | 'exponential' | undefined（固定延迟）
  },
});
```

也可单独使用工具函数：

```typescript
import { withRetry } from 'extension-bridge';

const data = await withRetry(
  () => fetch('https://api.example.com/data').then(r => r.json()),
  { attempts: 3, delay: 1000, backoff: 'exponential' }
);
```

---

## 🔍 DevTools 面板

Bridge 内置 Chrome DevTools 面板支持，可实时查看所有 API 调用、请求详情和耗时。

### 启用 DevTools 面板

1. 在 `manifest.json` 中添加：

```json
{
  "devtools_page": "devtools/devtools.html"
}
```

2. 将 `devtools/` 目录的文件复制到你的扩展项目，编译后加载。

3. 在 Chrome DevTools 中打开 **Bridge** 标签页，即可实时查看所有 Bridge 调用。

面板功能：
- 实时显示 request / response / error / subscribe 事件
- 点击事件查看完整 Request Params 和 Response Data
- 按 path 过滤事件
- 清除日志

---

## 🔧 类型生成工具

从 Service Worker 的 Bridge 定义自动生成客户端类型文件：

```bash
# 安装 tsx（如未安装）
npm install -D tsx

# 生成类型文件
npx tsx scripts/generate-types.ts \
  --input ./src/background.ts \
  --output ./src/bridge-client.d.ts
```

要求 background.ts 中 `router` 变量已 `export`：

```typescript
// background.ts
export const router = { ... };   // ← 必须 export
createBridge(router).listen();
```

生成的文件：

```typescript
// bridge-client.d.ts (auto-generated)
import type { InferClient } from 'extension-bridge';
import type { router } from '../background';
export type BridgeClient = InferClient<typeof router>;
```

---

## 🧪 E2E 测试

使用 Playwright 对真实 Chrome 扩展进行端到端测试：

```bash
# 安装依赖
pnpm install

# 构建测试 fixture 扩展 + 运行 E2E 测试
pnpm run test:e2e
```

测试文件位于 `__tests__/e2e/`，使用 `chromium.launchPersistentContext` 加载扩展后测试完整的通信流程。

---

## 🎓 了解更多

查看 [ARCHITECTURE.md](./ARCHITECTURE.md) 了解：
- 完整的架构设计
- 高级用法（React Hook、自定义 Procedure）
- 性能优化和最佳实践
- 中间件系统和 DevTools 集成
