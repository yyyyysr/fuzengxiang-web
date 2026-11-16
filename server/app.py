"""傅增湘藏书家智能体 · API server.

    python server/app.py            # http://127.0.0.1:8000  (serves web/dist when built)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import uvicorn  # noqa: E402
from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, StreamingResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

import config  # noqa: E402
import llm  # noqa: E402
from kb import KB  # noqa: E402
from rag import RAG  # noqa: E402

kb = KB()
rag = RAG(kb)
app = FastAPI(title="傅增湘藏书家智能体 API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def need(obj, what="资源"):
    if obj is None:
        raise HTTPException(404, f"{what}不存在")
    return obj


@app.get("/api/health")
def health():
    return {"ok": True, "kb_root": str(config.KB_ROOT), "pages": len(kb.pages), "documents": len(kb.documents),
            "llm": llm.settings.public(), "dense": {"ready": rag.dense.ready, "error": rag.dense.error}}


@app.post("/api/admin/reload")
def reload_kb():
    """Re-read knowledge_base exports after the wiki pipeline has been re-run."""
    kb.reload()
    return {"ok": True, "pages": len(kb.pages), "documents": len(kb.documents)}


@app.get("/api/overview")
def overview():
    fu = kb.page("傅增湘")
    return {"person": fu, "counts": {
        "documents": len(kb.documents), "canonical": sum(1 for d in kb.documents.values() if d["canonical"]),
        "stories": len(kb.by_type("story")), "cases": len(kb.by_type("case")), "events": len(kb.by_type("event")),
        "people": len(kb.by_type("person")), "books": len(kb.by_type("book")), "images": len(kb.images)}}


@app.get("/api/timeline")
def timeline():
    return kb.timeline


@app.get("/api/stories")
def stories():
    return kb.stories()


@app.get("/api/stories/{sid}")
def story(sid: str):
    return need(kb.story(sid), "故事")


@app.get("/api/cases")
def cases():
    return kb.cases()


@app.get("/api/cases/{cid}")
def case(cid: str):
    return need(kb.case(cid), "疑案")


@app.get("/api/books")
def books():
    return kb.books()


@app.get("/api/people")
def people():
    return kb.people()


@app.get("/api/network")
def network():
    return kb.network()


@app.get("/api/images")
def images():
    return kb.images


@app.get("/api/wiki/{pid}")
def wiki_page(pid: str):
    return need(kb.page(pid), "页面")


@app.get("/api/wiki")
def wiki_index(type: str | None = None):
    return [kb.page_card(p["id"]) for p in kb.pages.values() if (type is None or p["type"] == type) and p["type"] != "meta"]


@app.get("/api/docs")
def documents(q: str = "", origin: str = "", limit: int = 60):
    items = [d for d in kb.documents.values() if d["canonical"]]
    if q:
        items = [d for d in items if q in d["title"] or q in "".join(d["authors"]) or q in "".join(d["keywords"])]
    if origin:
        items = [d for d in items if d["origin"] == origin]
    return {"total": len(items), "items": [{k: d[k] for k in ("doc_id", "title", "authors", "origin", "year", "citation", "char_count", "kind")}
                                           for d in items[:limit]]}


@app.get("/api/docs/{doc_id}")
def document(doc_id: str):
    return need(kb.doc(doc_id), "文献")


@app.get("/api/search")
def search(q: str, limit: int = 20):
    return kb.search(q, limit)


class ChatIn(BaseModel):
    question: str
    history: list[dict] = []
    context: str | None = None


@app.post("/api/chat")
async def chat(body: ChatIn):
    question = body.question.strip()[:500]
    if not question:
        raise HTTPException(400, "问题不能为空")

    async def gen():
        async for ev in rag.answer(question, body.history, body.context):
            yield f"event: {ev['event']}\ndata: {json.dumps(ev['data'], ensure_ascii=False)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.post("/api/retrieve")
def retrieve(body: ChatIn):
    return rag.retrieve(body.question, body.context)


class LLMConfigIn(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None


@app.get("/api/llm/config")
def llm_config():
    return llm.settings.public()


@app.post("/api/llm/config")
def set_llm_config(body: LLMConfigIn):
    """Runtime override (kept in memory). Persist by writing LLM_* into .env."""
    llm.settings.update(body.api_key, body.base_url, body.model)
    return llm.settings.public()


app.mount("/kb-assets", StaticFiles(directory=config.ASSETS), name="kb-assets")

if config.WEB_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.WEB_DIST / "assets"), name="web-assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = config.WEB_DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(config.WEB_DIST / "index.html")


if __name__ == "__main__":
    import os
    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", 8000)))
