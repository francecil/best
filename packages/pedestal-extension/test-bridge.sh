#!/bin/bash

# Bridge 测试快速启动脚本

set -e

echo "========================================"
echo "🔌 Bridge 测试环境启动脚本"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 构建扩展
echo -e "${BLUE}步骤 1/3:${NC} 构建扩展..."
pnpm build
echo -e "${GREEN}✓${NC} 扩展构建完成"
echo ""

# 2. 检查是否已有服务器在运行
if lsof -i :8765 > /dev/null 2>&1; then
  echo -e "${YELLOW}⚠${NC}  服务器已在端口 8765 运行"
  echo ""
else
  # 3. 启动服务器
  echo -e "${BLUE}步骤 2/3:${NC} 启动测试服务器..."
  nohup pnpm run demo:bridge > /tmp/bridge-test-server.log 2>&1 &
  SERVER_PID=$!
  echo -e "${GREEN}✓${NC} 服务器已启动 (PID: $SERVER_PID)"
  echo ""
  sleep 2
fi

# 4. 显示说明
echo -e "${BLUE}步骤 3/3:${NC} 完成！"
echo ""
echo "========================================"
echo "📋 下一步操作："
echo "========================================"
echo ""
echo "1. 加载扩展到浏览器："
echo "   - 打开 chrome://extensions/"
echo "   - 启用'开发者模式'"
echo "   - 点击'加载已解压的扩展程序'"
echo "   - 选择: $(pwd)/.output/chrome-mv3"
echo ""
echo "2. 访问测试页面："
echo -e "   ${GREEN}http://127.0.0.1:8765/bridge-test.html${NC}"
echo ""
echo "3. 运行测试："
echo "   - 点击'运行所有测试'按钮"
echo "   - 查看测试结果和日志"
echo ""
echo "========================================"
echo "📚 文档链接："
echo "========================================"
echo ""
echo "- 测试指南: ./TESTING.md"
echo "- 审查报告: ../../TEST_RESULTS.md"
echo "- 服务器日志: /tmp/bridge-test-server.log"
echo ""
echo "========================================"
echo "🔧 常用命令："
echo "========================================"
echo ""
echo "停止服务器:  pkill -f 'serve.*8765'"
echo "查看日志:    tail -f /tmp/bridge-test-server.log"
echo "重新构建:    pnpm build"
echo ""
