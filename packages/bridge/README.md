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
import { managementProcedures } from 'extension-bridge/procedures/management';

export const bridge = createBridge({
  extensions: managementProcedures
}, { debug: true });

export type AppBridge = typeof bridge;

bridge.listen();
```

#### 2. Content Script (content-script.ts)

```typescript
import { connectBridge } from 'extension-bridge/connector';

connectBridge({ debug: true });
```

#### 3. Web Page (page.ts)

```typescript
import type { AppBridge } from './background';
import { createClient } from 'extension-bridge/client';

const bridge = createClient<AppBridge>();
await bridge.$waitForReady();

// 使用 - 完全类型安全
const extensions = await bridge.extensions.getAll.query();
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
const extensions = await client.extensions.getAll.query();
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
import { connectBridge } from 'extension-bridge/connector';

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
- ✅ **来源验证** - 可配置 allowedOrigins 白名单
- ✅ **API 白名单** - 只暴露明确定义的 Procedures
- ✅ **类型安全** - 编译时检查，减少运行时错误

---

## 🎓 了解更多

查看 [ARCHITECTURE.md](./ARCHITECTURE.md) 了解：
- 完整的架构设计
- 高级用法（React Hook、自定义 Procedure）
- 性能优化和最佳实践
- 开发者体验优化（日志、DevTools）
