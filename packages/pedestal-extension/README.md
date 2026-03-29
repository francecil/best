# FUTU 基建浏览器拓展

基于 [WXT](https://wxt.dev/) 的 Chromium 扩展，集成 [`extension-bridge`](https://github.com/your-org/extension-bridge)（workspace），用于在受控前提下让普通网页通过扩展进程调用 `chrome.management` 等 API。

## extension-bridge 演示页（已安装扩展列表）

演示页在 **HTTP** 上打开，以模拟网页主世界没有 `chrome.*` 的环境；content script 仅注入到本机固定端口，避免对任意站点注入 connector。

1. 在本仓库根目录执行 `pnpm install`（若尚未安装依赖）。
2. 构建扩展：`pnpm --filter pedestal-extension build`。
3. 打开 Chromium → **扩展程序** → **加载已解压的扩展程序**，选择目录
   `packages/pedestal-extension/.output/chrome-mv3`（或你本地构建产物路径）。
4. 启动静态服务（与 content script 的 `http://127.0.0.1:8765/*` 一致）：
   `pnpm --filter pedestal-extension demo:bridge`
   （脚本会先 `wxt build`，再用本包 devDependency `serve` 托管 `.output/chrome-mv3`。）
5. 在浏览器访问：
   [http://127.0.0.1:8765/bridge-demo.html](http://127.0.0.1:8765/bridge-demo.html)
   页面中的文本框应显示 `chrome.management.getAll()` 返回的 JSON。

若文本框为错误信息，请检查：扩展是否已加载并授予 **管理** 权限、URL 是否为 `127.0.0.1:8765`、以及是否已重新构建后再 serve。

## 开发

```bash
pnpm --filter pedestal-extension dev
```

类型检查：

```bash
pnpm --filter pedestal-extension compile
```
