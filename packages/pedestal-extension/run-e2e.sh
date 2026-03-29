#!/bin/bash

# Bridge E2E 测试运行脚本

set -e

echo "========================================"
echo "🧪 Bridge E2E 自动化测试"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. 检查是否已构建
if [ ! -d ".output/chrome-mv3" ]; then
  echo -e "${YELLOW}⚠${NC}  扩展尚未构建，正在构建..."
  pnpm build
  echo ""
else
  echo -e "${GREEN}✓${NC} 扩展已构建"
  echo ""
fi

# 2. 检查测试服务器
if lsof -i :8765 > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} 测试服务器已在运行"
  echo ""
else
  echo -e "${BLUE}启动测试服务器...${NC}"
  nohup pnpm run demo:bridge > /tmp/bridge-test-server.log 2>&1 &
  SERVER_PID=$!
  echo -e "${GREEN}✓${NC} 服务器已启动 (PID: $SERVER_PID)"
  echo ""
  sleep 3
fi

# 3. 安装 Playwright 浏览器（如果需要）
echo -e "${BLUE}检查 Playwright 浏览器...${NC}"
npx playwright install chromium --with-deps > /dev/null 2>&1 || true
echo -e "${GREEN}✓${NC} Playwright 就绪"
echo ""

# 4. 运行测试
echo "========================================"
echo "🚀 运行 E2E 测试..."
echo "========================================"
echo ""

pnpm test:e2e

echo ""
echo "========================================"
echo "✅ 测试完成！"
echo "========================================"
echo ""
echo "查看详细日志："
echo "  测试输出: 上方控制台"
echo "  服务器日志: /tmp/bridge-test-server.log"
echo ""
