"""Runtime configuration (environment variables, optionally from ../.env)."""
from __future__ import annotations

import os
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(PROJECT / ".env")

KB_ROOT = Path(os.environ.get("KB_ROOT", PROJECT.parent / "藏书家智能体" / "knowledge_base")).resolve()
EXPORT = KB_ROOT / "data" / "export"
INDEX = KB_ROOT / "data" / "index"
ASSETS = KB_ROOT / "assets"
WEB_DIST = PROJECT / "web" / "dist"

# OpenAI-compatible chat completion endpoint. Leave the key empty to run in
# retrieval-only mode (answers are compiled from the evidence without an LLM).
# LLM_* takes precedence; the server-wide DEEPSEEK_* variables are the fallback.
LLM_API_KEY = os.environ.get("LLM_API_KEY") or os.environ.get("DEEPSEEK_API_KEY", "")
LLM_BASE_URL = os.environ.get("LLM_BASE_URL") or os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
LLM_MODEL = os.environ.get("LLM_MODEL") or os.environ.get("DEEPSEEK_MODEL", "deepseek-flash")
LLM_TEMPERATURE = float(os.environ.get("LLM_TEMPERATURE", "0.3"))

# Dense retrieval needs sentence-transformers + data/index/embeddings.npy.
ENABLE_DENSE = os.environ.get("ENABLE_DENSE", "1") == "1"
