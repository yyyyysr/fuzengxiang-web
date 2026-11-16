"""A fake OpenAI-compatible endpoint for testing the LLM path without a real key.

    python scripts/mock_llm.py      # http://127.0.0.1:9100/v1/chat/completions

It streams back a short answer that echoes how many 【资料】 items it received,
so the test can confirm the RAG context reached the model.
"""
import json
import time

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

app = FastAPI()


@app.post("/v1/chat/completions")
async def chat(req: Request):
    body = await req.json()
    system = body["messages"][0]["content"]
    n = system.count("\n\n[") + (1 if "【资料】\n[" in system else 0)
    q = body["messages"][-1]["content"]
    auth = req.headers.get("authorization", "")
    text = f"（模拟大模型 {body.get('model')}，收到 {n} 条资料，鉴权头{'正确' if auth == 'Bearer test-key' else '错误'}）关于“{q}”：据资料记载，傅增湘居间斡旋，使宋本《扬子法言》合璧 [1][2]。"

    def gen():
        for i in range(0, len(text), 6):
            chunk = {"choices": [{"delta": {"content": text[i:i + 6]}}]}
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
            time.sleep(0.02)
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=9100)
