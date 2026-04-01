# Extension Bridge - 实施计划

> 📚 **文档导航**
>
> - 📘 [ARCHITECTURE.md](./ARCHITECTURE.md) - 完整使用指南和架构设计
> - **📋 当前文档: IMPLEMENTATION_PLAN.md** - 实施计划和后续工作
> - 💡 [README.md](./README.md) - 项目概述

---

## 📋 已完成的核心实现

### 1. 核心架构 ✅

**文件**:
- `core/types.ts` - 完整的类型系统
- `core/procedure.ts` - query/mutation/subscription builders
- `core/bridge.ts` - Service Worker 端实现
- `core/client.ts` - Web Page 端实现
- `core/logger.ts` - 美化日志

**特性**:
- ✅ 基于 JSON-RPC 2.0 协议
- ✅ MessageChannel 可靠通信
- ✅ 完整的类型推导系统
- ✅ 订阅自动管理和清理

### 2. 连接器 ✅

**文件**:
- `connector/index.ts` - Content Script 零配置连接器

**特性**:
- ✅ 自动创建 MessageChannel
- ✅ 双向消息转发
- ✅ 连接生命周期管理

### 3. 内置 Procedures ✅

**文件**:
- `procedures/management.ts` - Chrome Management API
- `procedures/tabs.ts` - Chrome Tabs API

**包含**:
- ✅ 所有常用 Management API
- ✅ 所有常用 Tabs API
- ✅ 实时事件订阅

### 4. 示例代码 ✅

**文件**:
- `example-new/background.ts` - Service Worker 示例
- `example-new/content-script.ts` - Content Script 示例
- `example-new/page.html` - 完整交互 Demo

---

## 🚀 接下来的工作

### Phase 1: 完善核心功能

#### 1.1 添加更多内置 Procedures

```typescript
// procedures/storage.ts
export const storageProcedures = {
  local: {
    get: query(async keys => chrome.storage.local.get(keys)),
    set: mutation(async items => chrome.storage.local.set(items)),
    remove: mutation(async keys => chrome.storage.local.remove(keys)),
    clear: mutation(async () => chrome.storage.local.clear())
  },
  sync: {
    // 同上
  }
};

// procedures/cookies.ts
// procedures/notifications.ts
// procedures/runtime.ts
```

#### 1.2 错误处理增强

```typescript
// core/error.ts
export class BridgeError extends Error {
  constructor(
    public code: JsonRpcErrorCode,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

// 在 bridge.ts 和 client.ts 中使用统一的错误类
```

#### 1.3 重试机制

```typescript
// core/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    attempts: number;
    delay: number;
    backoff?: 'linear' | 'exponential';
  }
): Promise<T> {
  // 实现重试逻辑
}

// 在 client.ts 中集成
```

---

### Phase 2: 开发体验优化

#### 2.1 类型生成工具

```typescript
// scripts/generate-types.ts
/**
 * 从 Service Worker 的 bridge 定义自动生成客户端类型文件
 */
import ts from 'typescript';

export function generateClientTypes(bridgeFile: string, outFile: string) {
  // 1. 解析 Service Worker 源码
  // 2. 提取 bridge 定义
  // 3. 生成对应的客户端类型
  // 4. 写入文件
}
```

使用：
```bash
npm run bridge:generate-types
```

#### 2.2 DevTools 扩展

```typescript
// devtools/panel.ts
/**
 * Chrome DevTools 面板
 * 显示所有 Bridge 调用、性能、错误等
 */

// 功能：
// - 实时查看所有 API 调用
// - 请求/响应详情
// - 性能分析
// - 错误追踪
```

#### 2.3 Debug 模式增强

```typescript
// core/debug.ts
export function enableDebug() {
  // 1. 美化所有日志
  // 2. 显示调用栈
  // 3. 性能计时
  // 4. 请求/响应 diff
}
```

---

### Phase 3: 高级特性

#### 3.1 中间件系统

```typescript
// core/middleware.ts
export interface Middleware {
  before?: (req: JsonRpcRequest) => Promise<JsonRpcRequest>;
  after?: (res: JsonRpcResponse) => Promise<JsonRpcResponse>;
  onError?: (error: Error) => Promise<void>;
}

// 使用
bridge.use(validateOrigin(['https://example.com']));
bridge.use(rateLimit({ window: 60000, max: 100 }));
bridge.use(logger({ level: 'debug' }));
```

#### 3.2 批量请求

```typescript
// 自动批处理
const [ext1, ext2, ext3] = await Promise.all([
  bridge.extensions.get.query('id1'),
  bridge.extensions.get.query('id2'),
  bridge.extensions.get.query('id3')
]);

// 实际只发送一次批量请求
const requestBody = {
  jsonrpc: '2.0',
  batch: [
    { id: 1, method: 'extensions.get', params: 'id1' },
    { id: 2, method: 'extensions.get', params: 'id2' },
    { id: 3, method: 'extensions.get', params: 'id3' }
  ]
};
```

#### 3.3 缓存系统

```typescript
// core/cache.ts
const bridge = createBridge({
  extensions: {
    getAll: query(async () => chrome.management.getAll())
      .cache({
        ttl: 60000, // 1分钟缓存
        key: 'extensions.getAll'
      })
  }
});

// 第一次调用 - 真实请求
await bridge.extensions.getAll.query();

// 1分钟内再次调用 - 返回缓存
await bridge.extensions.getAll.query();
```

#### 3.4 流式响应

```typescript
// 大数据量场景
const stream = bridge.extensions.getAll.stream();

for await (const chunk of stream) {
  console.log('Received chunk:', chunk);
  // 实时显示，不需要等待全部完成
}
```

---

### Phase 4: 测试和工具

#### 4.1 单元测试

```typescript
import { createTestBridge } from 'extension-bridge'
// __tests__/bridge.test.ts
import { describe, expect, it } from 'vitest';

describe('Bridge', () => {
  it('should call procedures', async () => {
    const bridge = createTestBridge({
      extensions: {
        getAll: query(async () => [{ id: 'test', name: 'Test' }])
      }
    });

    const result = await bridge.extensions.getAll.query();
    expect(result).toHaveLength(1);
  });
});
```

#### 4.2 E2E 测试

```typescript
import { loadExtension } from 'extension-bridge'
// __tests__/e2e.test.ts
import { test } from '@playwright/test';

test('should work in browser', async ({ page, context }) => {
  await loadExtension(context, './dist');
  await page.goto('https://example.com');

  const result = await page.evaluate(async () => {
    return window.bridge.extensions.getAll.query();
  });

  expect(result).toBeDefined();
});
```

#### 4.3 性能测试

```typescript
// __tests__/performance.test.ts
test('should handle 1000 concurrent requests', async () => {
  const requests = Array.from({ length: 1000 }, (_, i) =>
    bridge.extensions.get.query(`id${i}`));

  const start = Date.now();
  await Promise.all(requests);
  const duration = Date.now() - start;

  expect(duration).toBeLessThan(5000); // 5秒内完成
});
```

---

### Phase 5: 文档和示例

#### 5.1 完整文档

- [ ] API Reference
- [ ] 类型系统详解
- [ ] 最佳实践
- [ ] 常见问题
- [ ] 迁移指南

#### 5.2 更多示例

- [ ] React 完整应用
- [ ] Vue 3 完整应用
- [ ] 复杂的嵌套路由
- [ ] 自定义中间件
- [ ] 流式响应示例

---

## 📦 构建和发布

### 构建配置

```typescript
// build.config.ts
export default {
  entries: [
    // 核心
    { input: 'core/index.ts', name: 'index' },
    { input: 'core/client.ts', name: 'client' },
    { input: 'core/bridge.ts', name: 'bridge' },

    // 连接器
    { input: 'connector/index.ts', name: 'connector' },

    // Procedures
    { input: 'procedures/management.ts', name: 'procedures/management' },
    { input: 'procedures/tabs.ts', name: 'procedures/tabs' }
  ],
  declaration: true,
  rollup: {
    emitCJS: true
  }
};
```

### 包导出

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./client": {
      "types": "./dist/client.d.ts",
      "import": "./dist/client.mjs"
    },
    "./connector": {
      "types": "./dist/connector.d.ts",
      "import": "./dist/connector.mjs"
    },
    "./procedures/*": {
      "types": "./dist/procedures/*.d.ts",
      "import": "./dist/procedures/*.mjs"
    }
  }
}
```

---

## 🎯 优先级

### 必须完成 (P0)

1. ✅ 核心架构
2. ✅ 基础 Procedures (management, tabs)
3. ✅ 示例代码
4. ✅ 完善错误处理
5. ✅ 添加更多内置 Procedures
6. ✅ 单元测试
7. ✅ 支持通用 Procedures 调用

### 重要 (P1)

8. ⏳ 类型生成工具
9. ⏳ DevTools 面板
10. ⏳ 中间件系统
11. ⏳ E2E 测试
12. ⏳ 完整文档

### 可选 (P2)

13. ⏳ 批量请求
14. ⏳ 缓存系统
15. ⏳ 流式响应
16. ⏳ 性能测试
17. ⏳ 更多示例

---

## 🚀 立即开始

现在就可以开始使用新架构：

1. **复制核心文件** 到你的项目
   - `core/`
   - `connector/`
   - `procedures/`

2. **参考示例** 快速上手
   - `example-new/background.ts`
   - `example-new/content-script.ts`
   - `example-new/page.html`

3. **查看文档** 了解更多
   - [ARCHITECTURE.md](./ARCHITECTURE.md) - 完整使用指南和架构设计
   - [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - 本文档（实施计划）

---

## 📞 反馈和贡献

欢迎：
- 提交 Issue 报告问题
- 提交 PR 贡献代码
- 分享使用经验
- 提出改进建议

让我们一起打造最好用的浏览器扩展通信方案！🎉
