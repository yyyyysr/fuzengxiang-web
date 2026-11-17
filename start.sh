#!/usr/bin/env bash
# 启动傅增湘藏书家智能体网站（macOS / Linux）
#   ./start.sh            生产模式：构建前端（如需要）并由后端在 http://127.0.0.1:8000 提供整站
#   ./start.sh --dev      开发模式：后端 :8000 + Vite 热更新 :5173
#   ./start.sh --build    强制重新构建前端
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
export PYTHONIOENCODING=utf-8

DEV=0
BUILD=0
for arg in "$@"; do
  case "$arg" in
    --dev) DEV=1 ;;
    --build) BUILD=1 ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) echo "未知参数：$arg（可用 --dev、--build）" >&2; exit 1 ;;
  esac
done

need() { command -v "$1" >/dev/null 2>&1 || { echo "缺少 $1：$2" >&2; exit 1; }; }
need node "请安装 Node.js 18+（https://nodejs.org）"
need npm "请安装 Node.js 18+（自带 npm）"

# 后端 Python：KB_PYTHON > 知识库 .venv > 本项目 .venv（首次运行自动创建并安装依赖）
has_deps() { "$1" -c "import fastapi, uvicorn, httpx, jieba, opencc, yaml" >/dev/null 2>&1; }
PY="${KB_PYTHON:-}"
if [[ -z "$PY" && -x "$ROOT/../藏书家智能体/knowledge_base/.venv/bin/python" ]] && has_deps "$ROOT/../藏书家智能体/knowledge_base/.venv/bin/python"; then
  PY="$ROOT/../藏书家智能体/knowledge_base/.venv/bin/python"
fi
if [[ -z "$PY" ]]; then
  if [[ ! -x "$ROOT/.venv/bin/python" ]]; then
    SYS_PY="$(command -v python3 || command -v python || true)"
    [[ -n "$SYS_PY" ]] || { echo "缺少 Python 3.10+" >&2; exit 1; }
    echo "==> 创建 Python 虚拟环境 .venv"
    "$SYS_PY" -m venv "$ROOT/.venv"
  fi
  PY="$ROOT/.venv/bin/python"
  if ! has_deps "$PY"; then
    echo "==> 安装后端依赖（deploy/requirements-server.txt）"
    "$PY" -m pip install -q --upgrade pip
    "$PY" -m pip install -q -r "$ROOT/deploy/requirements-server.txt"
  fi
fi

if [[ ! -d "$ROOT/web/node_modules" ]]; then
  echo "==> 安装前端依赖"
  (cd "$ROOT/web" && npm install --no-audit --no-fund)
fi

if [[ "$DEV" == 1 ]]; then
  "$PY" "$ROOT/server/app.py" &
  BACKEND=$!
  trap 'kill $BACKEND 2>/dev/null || true' EXIT INT TERM
  (cd "$ROOT/web" && npx vite --host 127.0.0.1 --port 5173)
  exit
fi

if [[ "$BUILD" == 1 || ! -f "$ROOT/web/dist/index.html" ]]; then
  echo "==> 构建前端"
  (cd "$ROOT/web" && npm run build)
fi
echo "网站地址：http://127.0.0.1:${PORT:-8000}"
exec "$PY" "$ROOT/server/app.py"
