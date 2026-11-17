"""Minimal OpenAI-compatible chat-completions client (streaming)."""
from __future__ import annotations

import json
from typing import AsyncIterator

import httpx

import config


class LLMSettings:
    def __init__(self) -> None:
        self.api_key = config.LLM_API_KEY
        self.base_url = config.LLM_BASE_URL.rstrip("/")
        self.model = config.LLM_MODEL
        self.temperature = config.LLM_TEMPERATURE

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def public(self) -> dict:
        masked = (self.api_key[:4] + "…" + self.api_key[-4:]) if len(self.api_key) > 10 else ("已设置" if self.api_key else "")
        return {"configured": self.configured, "base_url": self.base_url, "model": self.model, "api_key": masked}

    def update(self, api_key: str | None, base_url: str | None, model: str | None) -> None:
        if api_key is not None:
            self.api_key = api_key.strip()
        if base_url:
            self.base_url = base_url.strip().rstrip("/")
        if model:
            self.model = model.strip()


settings = LLMSettings()


async def complete_json(messages: list[dict], temperature: float = 0.2, timeout: float = 180) -> dict:
    """One non-streaming call in JSON mode; returns the parsed object."""
    headers = {"Authorization": f"Bearer {settings.api_key}", "Content-Type": "application/json"}
    payload = {"model": settings.model, "messages": messages, "temperature": temperature, "max_tokens": 16000,
               "response_format": {"type": "json_object"}, "stream": False}
    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=15)) as client:
        resp = await client.post(f"{settings.base_url}/chat/completions", headers=headers, json=payload)
    if resp.status_code >= 400:
        raise RuntimeError(f"LLM 接口返回 {resp.status_code}：{resp.text[:300]}")
    choice = resp.json()["choices"][0]
    content = (choice["message"].get("content") or "").strip()
    content = content.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    if choice.get("finish_reason") == "length":
        raise RuntimeError("模型输出被截断（超出长度上限），请减少所选资料后重试")
    if not content:
        raise RuntimeError("模型返回了空内容")
    try:
        return json.loads(content, strict=False)  # long Markdown bodies often carry raw newlines inside strings
    except json.JSONDecodeError as e:
        raise RuntimeError(f"模型没有返回合法 JSON（{e.msg}，第 {e.pos} 字符）") from e


async def stream_chat(messages: list[dict]) -> AsyncIterator[tuple[str, str]]:
    """Yield ("reasoning", text) for thinking-model reasoning and ("content", text) for the answer."""
    headers = {"Authorization": f"Bearer {settings.api_key}", "Content-Type": "application/json"}
    payload = {"model": settings.model, "messages": messages, "temperature": settings.temperature, "stream": True}
    async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=15)) as client:
        async with client.stream("POST", f"{settings.base_url}/chat/completions", headers=headers, json=payload) as resp:
            if resp.status_code >= 400:
                body = (await resp.aread()).decode("utf-8", "replace")[:300]
                raise RuntimeError(f"LLM 接口返回 {resp.status_code}：{body}")
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    delta = json.loads(data)["choices"][0].get("delta", {})
                except (KeyError, IndexError, json.JSONDecodeError):
                    continue
                if delta.get("reasoning_content"):
                    yield "reasoning", delta["reasoning_content"]
                if delta.get("content"):
                    yield "content", delta["content"]
