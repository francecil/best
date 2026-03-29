# best

browser extension solution，提供了浏览器基座拓展以及浏览器扩展与网页之间类型安全的 RPC 通信桥 bridge。

## 项目结构

```
best/
├── packages/
│   ├── bridge/              # 核心库 extension-bridge
│   └── pedestal-extension/  # 消费端（Chrome 基座扩展）
├── pnpm-workspace.yaml
└── package.json
```

## 核心设计：三层通信模型

```
Web Page     ←── MessageChannel ──→   Content Script   ←── runtime.Port ──→   Service Worker
(Client)            JSON-RPC 2.0         (Connector)        JSON-RPC 2.0          (Bridge)
```

解决 MV3 扩展中 Service Worker 无法被网页直接调用的问题：

1. **Client** (`bridge/core/client.ts`): 网页侧，基于 Proxy 动态构建调用路径
2. **Connector** (`bridge/connector/index.ts`): Content Script，双向转发消息
3. **Bridge** (`bridge/core/bridge.ts`): Service Worker，处理 RPC 调用和订阅生命周期

## 关键技术模式

| 模式 | 说明 |
|------|------|
| tRPC 风格类型推导 | 用 Phantom Types (`_input`, `_output`) 实现端到端类型安全 |
| JSON-RPC 2.0 | 标准化请求/响应/订阅协议 |
| Proxy Router | 客户端用 JS Proxy 动态构建嵌套方法路径 |
| 指数退避重连 | Content Script 与 Service Worker 断线自动重连（最多 5 次，上限 10s） |
| 事件缓冲 | 握手阶段订阅事件入队，防止丢失 |
| 每端口订阅上限 | 单 Port 最多 50 个订阅，防止资源耗尽 |

## 三种 Procedure 类型

```typescript
query()        // 只读操作 → chrome.management.getAll()
mutation()     // 写操作   → chrome.management.setEnabled()
subscription() // 实时事件 → chrome.management.onInstalled
```

## 内置 Chrome API Procedure

**Management** (`procedures/management.ts`): `getAll` / `get` / `getSelf` / `setEnabled` / `uninstall` / `uninstallSelf` / `onChanged`

**Tabs** (`procedures/tabs.ts`): `create` / `get` / `query` / `update` / `remove` / `reload`

## 技术栈

| 层 | 技术 |
|----|------|
| 语言 | TypeScript 5.4（strict mode，ES2020） |
| 单元测试 | Vitest + Happy-DOM |
| E2E 测试 | Playwright |
| 扩展框架 | WXT + Vue 3 |
| 构建 | esbuild |
| 工具库 | es-toolkit |
| 包管理 | pnpm >= 8，Node >= 24 |

## 常用命令

```bash
pnpm build        # 构建所有包
pnpm test         # 运行所有测试
pnpm type-check   # TypeScript 类型检查
pnpm lint         # ESLint
```

