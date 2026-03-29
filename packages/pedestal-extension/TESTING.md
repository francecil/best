# Bridge 功能测试指南

## 测试套件说明

我们创建了一个全面的测试套件来验证 Bridge 通信框架的所有修复功能。测试页面位于 `entrypoints/bridge-test/`。

## 🚀 快速开始

### 1. 构建扩展

```bash
cd packages/pedestal-extension
pnpm build
```

### 2. 加载扩展到浏览器

1. 打开 Chrome/Edge 浏览器
2. 访问 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `packages/pedestal-extension/.output/chrome-mv3` 目录

### 3. 启动测试服务器

```bash
pnpm run demo:bridge
```

服务器将在 `http://127.0.0.1:8765` 启动。

### 4. 访问测试页面

在浏览器中打开：
```
http://127.0.0.1:8765/bridge-test.html
```

## 📋 测试覆盖

测试套件包含以下测试用例：

### P0 - 关键修复验证

#### ✅ Test 1: 多客户端订阅隔离
- **验证内容**：修复了订阅清理 bug，确保断开一个客户端不会影响其他客户端
- **预期结果**：创建多个订阅，取消其中一个后，其他订阅仍然活跃
- **对应问题**：Issue #2 - Subscription cleanup bug

#### ✅ Test 2: 订阅数量限制
- **验证内容**：每个客户端最多允许 50 个订阅
- **预期结果**：创建第 51 个订阅时抛出错误 "Subscription limit exceeded"
- **对应问题**：Issue #9 - Subscription limit per client

### P1 - 高优先级修复验证

#### ✅ Test 3: 订阅事件缓冲
- **验证内容**：订阅握手期间到达的事件会被缓冲，不会丢失
- **预期结果**：即使事件在 subscriptionId 返回前到达，也能正确接收
- **对应问题**：Issue #3 - Race condition in subscription setup

#### ✅ Test 4: 订阅创建错误处理
- **验证内容**：订阅创建失败时正确抛出错误，不会泄漏监听器
- **预期结果**：错误被正确捕获和传播
- **对应问题**：Issue #4 - Missing error handling

### 基础功能验证

#### ✅ Test 5: Query 操作
- **验证内容**：基础查询功能正常工作
- **测试方法**：调用 `extensions.getAll.query()` 获取所有扩展列表
- **预期结果**：返回扩展列表数组

#### ✅ Test 6: Subscription 订阅
- **验证内容**：订阅和取消订阅功能正常
- **测试方法**：订阅 `extensions.onChanged`，手动启用/禁用扩展触发事件
- **预期结果**：成功接收到事件通知
- **需要手动操作**：在扩展管理页面启用/禁用任意扩展

### 性能测试

#### ✅ Test 7: 并发查询性能
- **验证内容**：验证 procedure 缓存优化效果
- **测试方法**：并发执行 100 个查询请求
- **预期结果**：
  - 所有请求成功完成
  - 平均响应时间 < 50ms
  - 对应问题：Issue #8 - Procedure resolution cache

## 🔧 手动测试场景

### 场景 1: 测试连接重试机制

1. 打开测试页面
2. 在浏览器中点击扩展图标右键 -> "管理扩展"
3. 关闭扩展
4. 重新启用扩展
5. 观察日志，应该看到自动重连成功

**对应修复**：Issue #5 - Connection retry logic

### 场景 2: 测试连接断开后的快速失败

1. 打开浏览器开发者工具 -> Console
2. 在测试页面点击"Query 操作测试"
3. 在请求过程中，快速重载扩展
4. 观察：请求应该立即失败，而不是等待 30 秒超时

**对应修复**：Issue #6 - Request cleanup on connection loss

### 场景 3: 测试多标签页隔离

1. 在多个标签页打开 `http://127.0.0.1:8765/bridge-test.html`
2. 在每个标签页点击"Subscription 订阅测试"
3. 启用/禁用一个扩展
4. 观察：所有标签页都应该收到事件
5. 关闭其中一个标签页
6. 再次触发事件
7. 观察：其他标签页仍然能收到事件

**对应修复**：Issue #1 - Port reference memory leak, Issue #2 - Subscription cleanup bug

## 📊 预期测试结果

运行 "运行所有测试" 按钮后，应该看到：

```
✅ 通过: 6/6 自动化测试
⚠️  需要手动验证: Test 6 (需要手动触发扩展事件)
```

### 自动化测试通过标准

- Test 1: 创建并取消订阅后，其他订阅仍然活跃
- Test 2: 达到 50 个订阅限制
- Test 3: 事件缓冲机制就绪
- Test 4: 错误处理正确工作
- Test 5: 查询返回扩展列表
- Test 7: 100 个并发查询平均响应时间 < 50ms

### 手动测试通过标准

- Test 6: 启用/禁用扩展后，订阅回调被触发

## 🐛 故障排查

### 问题：页面显示"连接失败"

**解决方法**：
1. 确保扩展已正确加载（检查 `chrome://extensions/`）
2. 确保访问的是 `http://127.0.0.1:8765` 而不是其他地址
3. 刷新页面重试
4. 检查浏览器控制台和扩展 Service Worker 的错误日志

### 问题：Content Script 未注入

**解决方法**：
1. 检查 `manifest.json` 中的 content_scripts 配置
2. 确保 URL 匹配规则正确：`http://127.0.0.1:8765/*`
3. 重新加载扩展

### 问题：订阅测试无法触发

**解决方法**：
1. 打开 `chrome://extensions/`
2. 找到任意其他扩展
3. 点击开关按钮来启用/禁用它
4. 返回测试页面，应该能看到事件

### 问题：性能测试失败

**可能原因**：
1. 电脑性能较慢
2. 浏览器负载较高
3. Service Worker 未预热

**解决方法**：
- 关闭其他标签页和应用
- 先运行一次 Query 测试预热缓存
- 多运行几次取平均值

## 📝 测试日志说明

测试页面底部的日志区域会显示详细的执行日志：

- 🔵 **INFO**: 一般信息
- ✅ **SUCCESS**: 操作成功
- ❌ **ERROR**: 错误信息
- ⚠️  **WARN**: 警告信息

日志内容包括：
- Bridge 连接状态
- 每个测试的开始和结束
- 订阅事件的触发
- 错误堆栈信息

## 🔍 调试技巧

### 查看 Bridge 通信日志

Bridge 客户端和服务端都开启了 debug 模式，你可以在以下地方查看详细日志：

1. **页面端**：浏览器开发者工具 -> Console
   - 查看 `[Client]` 标签的日志
   - 查看 `[Bridge Connector]` 标签的日志

2. **Service Worker 端**：
   - 访问 `chrome://extensions/`
   - 找到 "FUTU Pedestal Extension"
   - 点击 "Service Worker" 链接
   - 查看 `[Bridge]` 标签的日志

### 查看网络通信

虽然 Bridge 使用 MessageChannel 而不是 HTTP，但你可以：

1. 在 Service Worker 控制台设置断点
2. 在 `bridge.ts` 的 `handleMessage` 方法设置 console.log
3. 观察 JSON-RPC 请求和响应的结构

## 📈 性能基准

在正常情况下，预期性能指标：

| 指标 | 预期值 | 说明 |
|------|--------|------|
| Query 响应时间 | < 10ms | 单次查询 |
| 并发查询吞吐量 | > 1000 qps | 100 并发 |
| 订阅建立时间 | < 50ms | 从请求到接收 subscriptionId |
| 事件分发延迟 | < 5ms | 从触发到回调执行 |
| 内存占用 | < 5MB | 50 个活跃订阅 |

## 🎯 下一步

测试通过后，你可以：

1. **集成到 CI/CD**：将测试套件集成到自动化测试流程
2. **添加更多测试**：基于实际业务场景添加专项测试
3. **性能监控**：在生产环境添加性能指标收集
4. **错误追踪**：集成 Sentry 等错误追踪服务

## 🤝 贡献

如果发现测试覆盖不全或有 bug，欢迎：

1. 在测试文件中添加新的测试用例
2. 提交 Issue 描述问题
3. 提交 PR 修复问题

## 📚 相关文档

- [Bridge 架构文档](../bridge/ARCHITECTURE.md)
- [开发指南](../bridge/README.md)
- [API 参考](../bridge/API.md)
