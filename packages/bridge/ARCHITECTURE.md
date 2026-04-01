# Extension Bridge - 完整指南

> 📚 **文档导航**
>
> - **📘 当前文档: ARCHITECTURE.md** - 完整使用指南和架构设计
> - 📋 [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - 实施计划和后续工作
> - 💡 [README.md](./README.md) - 项目概述

---

## 🎯 设计目标

1. **极简 API** - 开发者只需要关心业务逻辑
2. **端到端类型安全** - 从定义到调用全程类型推导
3. **零配置** - 开箱即用，自动处理所有通信细节
4. **可靠通信** - 使用 MessageChannel 确保消息可靠送达
5. **现代化开发体验** - DevTools、Hot Reload、日志美化

---

## 📐 核心架构

### 1. 基于 MessageChannel 的可靠通信

传统的 `postMessage` 方案存在问题：
- ❌ 全局广播，容易误接收
- ❌ 无法确认消息送达
- ❌ 难以调试

**新方案：使用 MessageChannel**

```typescript
// 建立专用通道
const channel = new MessageChannel();

// 页面端持有 port1
window.port = channel.port1;

// Content Script 持有 port2，转发到 Background
chrome.runtime.sendMessage({ type: 'connect', port: channel.port2 }, [channel.port2]);
```

优势：
- ✅ 点对点通信，隔离干扰
- ✅ 可靠送达确认
- ✅ 支持双向流式通信

### 2. 类型安全的 RPC (参考 tRPC)

不再手动拼接 API 路径，而是定义类型安全的 Procedures：

```typescript
// 1. 在 Service Worker 定义 API
const bridge = createBridge({
  // 查询类操作
  getExtensions: query(async () => {
    return chrome.management.getAll();
  }),

  getExtension: query(async (id: string) => {
    return chrome.management.get(id);
  }),

  // 变更类操作
  toggleExtension: mutation(async ({ id, enabled }: { id: string; enabled: boolean }) => {
    return chrome.management.setEnabled(id, enabled);
  }),

  // 订阅类操作 (实时事件)
  onExtensionChange: subscription((emit) => {
    const handler = info => emit(info);
    chrome.management.onInstalled.addListener(handler);
    chrome.management.onUninstalled.addListener(handler);

    return () => {
      chrome.management.onInstalled.removeListener(handler);
      chrome.management.onUninstalled.removeListener(handler);
    };
  })
});

// 导出类型
export type BridgeRouter = typeof bridge;
```

```typescript
// 2. 在页面端使用 - 完全类型安全
const client = createClient<BridgeRouter>();

// TypeScript 自动推导返回类型
const extensions = await client.getExtensions();
//    ^? ExtensionInfo[]

const ext = await client.getExtension('extension-id');
//    ^? ExtensionInfo

await client.toggleExtension({ id: 'xxx', enabled: false });

// 订阅事件（传入回调即订阅，返回取消订阅函数）
const unsubscribe = client.onExtensionChange((data) => {
  console.log('Extension changed:', data);
});
```

### 3. 自动化的 Content Script

不需要手写转发逻辑，使用预构建的 bridge-connector:

```typescript
// content-script.ts
import { connectBridge } from 'extension-bridge'

connectBridge(); // 完成！
```

内部自动处理：
- MessageChannel 创建和连接
- 消息序列化/反序列化
- 错误捕获和上报
- 重连机制

### 4. 插件化的能力扩展

```typescript
const bridge = createBridge({
  // 核心 API
  ...managementProcedures,
  ...tabsProcedures,

  // 自定义业务逻辑
  analytics: {
    track: mutation(async (event: string, data: any) => {
      // 自定义逻辑
      await sendToAnalytics(event, data);
    })
  }
});
```

---

## 🛠️ 实现细节

### 核心模块

```
extension-bridge
├── core/
│   ├── bridge.ts          # createBridge - 服务端定义
│   ├── client.ts          # createClient - 客户端调用
│   ├── channel.ts         # MessageChannel 封装
│   ├── serializer.ts      # 序列化/反序列化
│   └── error.ts           # 错误处理
│
├── connector/
│   └── index.ts           # Content Script 连接器
│
├── procedures/
│   ├── query.ts           # 查询操作
│   ├── mutation.ts        # 变更操作
│   └── subscription.ts    # 订阅操作
│
├── built-in/
│   ├── management.ts      # chrome.management API
│   ├── tabs.ts            # chrome.tabs API
│   └── storage.ts         # chrome.storage API
│
├── devtools/
│   ├── logger.ts          # 美化日志
│   └── inspector.ts       # DevTools 面板
│
└── index.ts               # 主入口
```

### 消息协议

使用 JSON-RPC 2.0 规范：

请求：

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "getExtensions",
  "params": []
}
```

响应：

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": []
}
```

错误：

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "error": {
    "code": -32600,
    "message": "Invalid Request"
  }
}
```

### 类型推导

利用 TypeScript 的条件类型和映射类型：

```typescript
type ProcedureType = 'query' | 'mutation' | 'subscription';

interface Procedure<TInput = unknown, TOutput = unknown> {
  _type: ProcedureType;
  _input: TInput;
  _output: TOutput;
  handler: (input: TInput) => Promise<TOutput> | TOutput;
}

// 自动推导 Client 类型 - procedure 直接映射为可调用函数
type InferClient<TRouter> = {
  [K in keyof TRouter]: TRouter[K] extends Procedure<infer TInput, infer TOutput, infer TType>
    ? TType extends 'subscription'
      ? (callback: (data: TOutput) => void) => () => void
      : TInput extends void
        ? () => Promise<TOutput>
        : (input: TInput) => Promise<TOutput>
    : never
};
```

---

## 🚀 使用示例

### 1. 定义 API (Service Worker)

```typescript
// background/bridge.ts
import { createBridge, mutation, query, subscription } from 'extension-bridge';

export const bridge = createBridge({
  // 内置 API
  extensions: {
    getAll: query(async () => chrome.management.getAll()),
    get: query(async (id: string) => chrome.management.get(id)),
    toggle: mutation(async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await chrome.management.setEnabled(id, enabled);
    }),
    onChanged: subscription((emit) => {
      const handlers = {
        installed: info => emit({ type: 'installed', data: info }),
        uninstalled: id => emit({ type: 'uninstalled', data: id })
      };

      chrome.management.onInstalled.addListener(handlers.installed);
      chrome.management.onUninstalled.addListener(handlers.uninstalled);

      return () => {
        chrome.management.onInstalled.removeListener(handlers.installed);
        chrome.management.onUninstalled.removeListener(handlers.uninstalled);
      };
    })
  },

  tabs: {
    create: mutation(async (url: string) => chrome.tabs.create({ url })),
    query: query(async (options: chrome.tabs.QueryInfo) => chrome.tabs.query(options))
  }
});

export type AppBridge = typeof bridge;

// 初始化
bridge.listen();
```

### 2. 连接 (Content Script)

```typescript
// content-script.ts
import { connectBridge } from 'extension-bridge';

connectBridge({
  debug: process.env.NODE_ENV === 'development'
});
```

### 3. 使用 (Web Page)

```typescript
import type { AppBridge } from './background/bridge';
// page.ts
import { createClient } from 'extension-bridge'

// 创建客户端
const bridge = createClient<AppBridge>();

// 等待连接
await bridge.$waitForReady();

// 使用 API - 完全类型安全
async function demo() {
  // 查询 / 变更 - 直接调用
  const extensions = await bridge.extensions.getAll();
  console.log('Extensions:', extensions);

  const ext = await bridge.extensions.get('extension-id');
  console.log('Extension:', ext);

  await bridge.extensions.toggle({ id: 'extension-id', enabled: false });

  // 订阅 - 传入回调，返回取消订阅函数
  const unsubscribe = bridge.extensions.onChanged((event) => {
    if (event.type === 'installed') {
      console.log('Installed:', event.data.name);
    }
  });

  // 取消订阅
  // unsubscribe()
}
```

### 4. React Hook

```typescript
import type { AppBridge } from '../background/bridge';
import { createClient } from 'extension-bridge'
// hooks/useBridge.ts
import { useEffect, useState } from 'react';

const bridge = createClient<AppBridge>();

export function useBridge() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    bridge.$waitForReady().then(() => setReady(true));
  }, []);

  return { bridge, ready };
}

export function useExtensions() {
  const { bridge: appBridge, ready } = useBridge();
  const [extensions, setExtensions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) {
      return;
    }

    // 初始加载
    appBridge.extensions.getAll()
      .then(setExtensions)
      .finally(() => setLoading(false));

    // 订阅变化
    const unsubscribe = appBridge.extensions.onChanged(() => {
      appBridge.extensions.getAll().then(setExtensions);
    });

    return unsubscribe;
  }, [ready]);

  return { extensions, loading };
}
```

---

## 🎨 开发者体验

### 1. 美化的日志

```typescript
// 开发模式下自动启用
bridge.use(logger({
  format: 'pretty', // 彩色输出
  level: 'debug'
}));
```

输出：
```
🔵 [Query] extensions.getAll
   ⏱️  12ms
   ✅ Success: 15 items

🟢 [Mutation] extensions.toggle
   📝 { id: 'abc...', enabled: false }
   ⏱️  45ms
   ✅ Done

🟣 [Subscription] extensions.onChanged
   📨 { type: 'installed', data: {...} }
```

### 2. DevTools 面板

```typescript
bridge.use(devtools());
```

功能：
- 📊 实时监控所有 API 调用
- 🔍 请求/响应详情查看
- 📈 性能分析
- 🐛 错误追踪

### 3. 类型自动生成

```bash
npm run bridge:types
```

自动从 Service Worker 的定义生成客户端类型文件，无需手动维护。

---

## 🔐 安全机制

### 1. 自动来源验证

```typescript
bridge.use(validateOrigin({
  allowed: ['https://your-domain.com'],
  reject: (origin) => {
    console.error('Rejected:', origin);
  }
}));
```

### 2. 权限检查

```typescript
bridge.use(checkPermissions({
  'extensions.toggle': ['management'],
  'tabs.create': ['tabs']
}));
```

### 3. 速率限制

```typescript
bridge.use(rateLimit({
  'extensions.toggle': {
    window: 60000, // 1分钟
    max: 10 // 最多10次
  }
}));
```

---

## 📊 性能优化

### 1. 自动批处理

```typescript
// 自动合并多个请求
const [ext1, ext2, ext3] = await Promise.all([
  bridge.extensions.get.query('id1'),
  bridge.extensions.get.query('id2'),
  bridge.extensions.get.query('id3')
]);
// 实际只发送一次请求
```

### 2. 结果缓存

```typescript
const extensions = await bridge.extensions.getAll.query();
// 使用缓存，不会重新请求
const cached = await bridge.extensions.getAll.query();
```

### 3. 订阅去重

同一事件的多个订阅自动合并，只向 Background 注册一次。

---

## 🧪 测试方案

### 1. 单元测试

```typescript
import { createTestBridge } from 'extension-bridge'

it('should get extensions', async () => {
  const bridge = createTestBridge({
    extensions: {
      getAll: query(async () => [{ id: 'test', name: 'Test' }])
    }
  });

  const result = await bridge.extensions.getAll.query();
  expect(result).toHaveLength(1);
});
```

### 2. E2E 测试

```typescript
import { loadExtension } from 'extension-bridge'
import { test } from '@playwright/test';

test('should work in real browser', async ({ page, context }) => {
  await loadExtension(context, './dist');
  await page.goto('https://example.com');

  const extensions = await page.evaluate(async () => {
    return window.bridge.extensions.getAll.query();
  });

  expect(extensions).toBeDefined();
});
```

---

## 📦 包结构

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./client": "./dist/client.js",
    "./connector": "./dist/connector.js",
    "./testing": "./dist/testing.js"
  }
}
```

使用：
```typescript
// Service Worker
import { createBridge } from 'extension-bridge';

// Web Page
import { createClient } from 'extension-bridge'

// Content Script
import { connectBridge } from 'extension-bridge'

// Testing
import { createTestBridge } from 'extension-bridge'
```

---

## 🎯 与传统方案对比

| 特性 | 传统方案 | 新方案 |
|-----|---------|--------|
| API 定义 | 字符串路径 | 类型安全的函数 |
| 类型安全 | 手动维护 | 自动推导 |
| 通信方式 | postMessage | MessageChannel |
| 错误处理 | 手动 try-catch | 自动捕获和重试 |
| 开发体验 | 原始日志 | 美化日志 + DevTools |
| 学习成本 | 需要理解通信细节 | 只需定义 API |
| 代码量 | 需要手写大量转发代码 | 零配置 |

这个新架构的核心优势：

1. **开发者友好** - API 设计直观，学习成本低
2. **类型安全** - 端到端类型推导，减少错误
3. **零配置** - 自动处理所有通信细节
4. **可扩展** - 插件机制支持任意自定义
5. **现代化** - 符合当前业界最佳实践
