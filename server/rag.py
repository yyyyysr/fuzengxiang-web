"""Retrieval-augmented answering over the wiki and the source corpus."""
from __future__ import annotations

import json
import math
import re
import threading
from typing import AsyncIterator

import jieba

import config
import llm
from kb import KB, connect, fold

jieba.setLogLevel(60)

STOP = {"什么", "怎么", "为什么", "如何", "哪些", "哪个", "哪里", "有没有", "一下", "关于", "是否", "可以", "能否",
        "时候", "当时", "后来", "先生", "介绍", "请问", "知道", "告诉", "一个", "这个", "那个", "他们", "我们", "事情",
        "情况", "怎样", "多少", "几个", "傅增湘", "傅增", "增湘", "是怎么", "怎么样"}
SAD_WORDS = ("失火", "火灾", "失窃", "被盗", "水灾", "大水", "散出", "散佚", "逝世", "去世", "劫", "毁", "中风")

SYSTEM_PROMPT = """你是“小傅”，傅增湘藏书家智能体网站的当代导览伙伴。你不是傅增湘本人，不用第一人称冒充他。
回答规则：
1. 只依据下方【资料】作答，先给结论，再给依据；每个事实句后用 [编号] 标注出处，编号对应资料条目。
2. 区分证据层级：原始材料明载（题跋、书札、日记、档案）／研究者推断（论文考证）／现有材料不足。必要时在句末注明。
3. 区分作品、版本与具体藏本；区分旧藏、经眼、校勘、题跋、借阅、影印、捐赠，不把“经眼”说成“旧藏”。
4. 不补写心理活动，不推测未记载的结局；资料不足时直接说缺少什么材料，并建议读者查看哪条证据。
5. 用简体中文，语气亲切简洁，面向对古籍感兴趣的学生和普通读者，一般不超过 300 字。"""


class Dense:
    """Optional embedding retrieval, loaded in the background so startup stays fast."""

    def __init__(self) -> None:
        self.ready = False
        self.error = ""
        if config.ENABLE_DENSE and (config.INDEX / "embeddings.npy").exists():
            threading.Thread(target=self._load, daemon=True).start()
        else:
            self.error = "disabled or embeddings missing"

    def _load(self) -> None:
        try:
            import numpy as np
            from modelscope import snapshot_download
            from sentence_transformers import SentenceTransformer
            meta = json.loads((config.INDEX / "embeddings_ids.json").read_text(encoding="utf-8"))
            self.rows = meta["rows"]
            self.vecs = np.load(config.INDEX / "embeddings.npy").astype("float32")
            self.model = SentenceTransformer(snapshot_download(meta["model"]))
            self.np = np
            self.ready = True
        except Exception as e:  # noqa: BLE001 - optional component
            self.error = str(e)[:200]

    def search(self, query: str, k: int = 30) -> list[dict]:
        if not self.ready:
            return []
        q = self.model.encode(["为这个句子生成表示以用于检索相关文章：" + query], normalize_embeddings=True)[0]
        scores = self.vecs @ q
        top = scores.argsort()[::-1][:k]
        return [{**self.rows[i], "sim": float(scores[i])} for i in top]


class RAG:
    def __init__(self, kb: KB) -> None:
        self.kb = kb
        self.dense = Dense()

    # ---- retrieval -------------------------------------------------------
    def terms(self, question: str, entities: list[str]) -> list[str]:
        q = fold(question)
        for e in entities:
            for alias in [self.kb.pages[e]["title"], *self.kb.pages[e].get("aliases", [])]:
                q = q.replace(fold(alias), " ")
        words = re.findall(r"(?:1[89]|20)\d{2}", q) + [w.strip() for w in jieba.cut_for_search(q) if len(w.strip()) >= 2]
        seen, out = set(), []
        for w in words:
            keep = re.fullmatch(r"(?:1[89]|20)\d{2}", w) or not re.fullmatch(r"[\W\d]+", w)
            if w not in STOP and keep and w not in seen:
                seen.add(w)
                out.append(w)
        return out[:8]

    def scored(self, con, table: str, key: str, terms: list[str], limit: int, extra_cols: str = "") -> list[dict]:
        """IDF-weighted term matching over folded text (works for 1-2 character terms too)."""
        if not terms:
            return []
        total = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        cand: dict = {}
        weights = {}
        for t in terms:
            rows = con.execute(f"SELECT {key}, fold{extra_cols} FROM {table} WHERE fold LIKE ? LIMIT 3000", (f"%{t}%",)).fetchall()
            df = max(len(rows), 1)
            weights[t] = math.log(1 + total / df)
            for r in rows:
                cand[r[0]] = r
        out = []
        for k, r in cand.items():
            f = r[1]
            s = sum(weights[t] * min(f.count(t), 3) ** 0.5 for t in terms if t in f)
            hit = sum(1 for t in terms if t in f)
            out.append({"id": k, "score": s * (1 + 0.5 * (hit - 1)), "row": r})
        out.sort(key=lambda x: -x["score"])
        return out[:limit]

    def cited_blocks(self, pid: str) -> list[tuple[str, str]]:
        out = []
        for m in re.finditer(r"\[\[([a-z]+-\d{4})#\^(b\d{4})", self.kb.pages[pid]["body"]):
            if (m.group(1), m.group(2)) not in out:
                out.append((m.group(1), m.group(2)))
        return out

    def entity_terms(self, pid: str) -> list[str]:
        """Searchable core names of a wiki entity: 宋本《扬子法言》（海源阁旧藏） -> 扬子法言."""
        p = self.kb.pages[pid]
        title = fold(p["title"])
        inner = re.findall(r"《([^》]+)》", title)
        core = inner or [re.sub(r"[（(].*?[）)]", "", title).strip()]
        if p["type"] in ("story", "case", "event"):
            return core[:1] if inner else []
        return [c for c in core if len(c) >= 2][:2]

    def retrieve(self, question: str, context_page: str | None = None) -> dict:
        entities = self.kb.spot_entities(question)
        if context_page and context_page in self.kb.pages and context_page not in entities:
            entities.append(context_page)
        terms = self.terms(question, entities)
        names = []
        for e in entities:
            if e == "傅增湘":
                continue
            for n in self.entity_terms(e):
                if n not in names:
                    names.append(n)
        con = connect()
        fused: dict[tuple, float] = {}

        def add(key, rank, weight=1.0):
            fused[key] = fused.get(key, 0.0) + weight / (50 + rank)

        others = [e for e in entities if e != "傅增湘"]
        for i, e in enumerate(entities):
            add(("wiki", e), i, 0.6 if (e == "傅增湘" and (others or terms)) else 3.0)
        query_terms = (names + terms)[:8]
        if query_terms:
            for i, w in enumerate(self.scored(con, "wiki_pages", "page_id", query_terms, 30, ", type")):
                if w["row"][2] not in ("meta",):
                    add(("wiki", w["id"]), i, 1.6 if w["row"][2] != "source" else 0.5)
            for i, c in enumerate(self.scored(con, "chunks", "chunk_id", query_terms, 40, ", kind")):
                add(("chunk", c["id"]), i, 0.4 if c["row"][2] == "notes" else 1.4)
        for i, d in enumerate(self.dense.search(question)):
            add((d["kind"], d["id"]), i, 1.2)

        # The wiki already links its claims to source paragraphs: pull the paragraphs
        # cited by the best wiki pages in as evidence (bridges wording gaps like 水灾/大水).
        top_wiki = [k[1] for k in sorted(fused, key=fused.get, reverse=True)
                    if k[0] == "wiki" and k[1] in self.kb.pages and k[1] != "傅增湘"][:2]
        for pid in top_wiki:
            for j, (doc, bid) in enumerate(self.cited_blocks(pid)[:4]):
                r = con.execute("SELECT chunk_id FROM chunks WHERE doc_id=? AND block_ids LIKE ?", (doc, f'%"{bid}"%')).fetchone()
                if r:
                    add(("chunk", r[0]), j, 2.0)

        ranked = sorted(fused, key=fused.get, reverse=True)
        wiki_ids = [k[1] for k in ranked if k[0] == "wiki" and k[1] in self.kb.pages][:4]
        chunk_ids = [k[1] for k in ranked if k[0] == "chunk"][:6]
        chunks = []
        for cid in chunk_ids:
            r = con.execute("SELECT c.chunk_id, c.doc_id, c.heading, c.block_ids, c.page_start, c.text FROM chunks c WHERE c.chunk_id=?", (cid,)).fetchone()
            if r:
                d = self.kb.documents.get(r["doc_id"], {})
                chunks.append({"chunk_id": r["chunk_id"], "doc_id": r["doc_id"], "heading": r["heading"],
                               "bid": (json.loads(r["block_ids"]) or [None])[0], "page": r["page_start"],
                               "text": r["text"], "title": d.get("title", ""), "authors": d.get("authors", []),
                               "citation": d.get("citation", "")})
        con.close()
        sources = []
        for pid in wiki_ids:
            p = self.kb.pages[pid]
            body = re.sub(r"\n{2,}", "\n", p["body"])
            sources.append({"n": len(sources) + 1, "kind": "wiki", "id": pid, "title": p["title"], "type": p["type"],
                            "summary": p["summary"], "text": body[:1400]})
        for c in chunks:
            sources.append({"n": len(sources) + 1, "kind": "chunk", "id": c["doc_id"], "bid": c["bid"], "page": c["page"],
                            "title": c["title"], "authors": c["authors"], "citation": c["citation"],
                            "heading": c["heading"], "text": c["text"][:900]})
        return {"entities": entities, "terms": terms, "sources": sources, "dense": self.dense.ready}

    # ---- answering -------------------------------------------------------
    @staticmethod
    def emotion(question: str, sources: list[dict]) -> str:
        text = question + "".join(s.get("summary", "") for s in sources[:2])
        if any(w in text for w in SAD_WORDS):
            return "sad"
        if not sources:
            return "encourage"
        return "happy"

    def build_messages(self, question: str, sources: list[dict], history: list[dict]) -> list[dict]:
        ctx = []
        for s in sources:
            if s["kind"] == "wiki":
                ctx.append(f"[{s['n']}] wiki《{s['title']}》：{s['text']}")
            else:
                who = "、".join(s.get("authors") or [])
                ctx.append(f"[{s['n']}] 原文《{s['title']}》{('（' + who + '）') if who else ''}"
                           f"{(' § ' + s['heading']) if s.get('heading') else ''}：{s['text']}")
        msgs = [{"role": "system", "content": SYSTEM_PROMPT + "\n\n【资料】\n" + "\n\n".join(ctx or ["（未检索到相关资料）"])}]
        for h in history[-6:]:
            if h.get("role") in ("user", "assistant") and h.get("content"):
                msgs.append({"role": h["role"], "content": h["content"][:800]})
        msgs.append({"role": "user", "content": question})
        return msgs

    def extractive_answer(self, question: str, retrieval: dict) -> str:
        """Answer without an LLM: compile summaries and the most relevant sentences, with citations."""
        sources = retrieval["sources"]
        if not sources:
            return ("我在知识库里没有找到和这个问题直接相关的记载。可以换个说法，或者告诉我具体的人名、书名、年份，"
                    "比如“宋本《扬子法言》是怎么合璧的？”")
        keys = [fold(k) for k in retrieval["terms"]] + [n for e in retrieval["entities"]
                                                        if e in self.kb.pages and e != "傅增湘" for n in self.entity_terms(e)]
        lines = []
        wiki = [s for s in sources if s["kind"] == "wiki" and s["summary"]]
        if len(wiki) > 1 and wiki[0]["id"] == "傅增湘" and retrieval["terms"]:
            wiki = wiki[1:] + wiki[:1]
        if wiki:
            lines.append(f"{wiki[0]['summary']} [{wiki[0]['n']}]")
            for s in wiki[1:2]:
                lines.append(f"相关的还有《{s['title']}》：{s['summary']} [{s['n']}]")
        picked = []
        for s in sources:
            if s["kind"] != "chunk":
                continue
            sents = [x for x in re.split(r"(?<=[。！？；])", s["text"].replace("\n", "")) if 12 <= len(x) <= 160]
            scored = sorted(sents, key=lambda x: -sum(fold(x).count(k) for k in keys)) if keys else sents
            if scored and (not keys or any(k in fold(scored[0]) for k in keys)):
                picked.append(f"《{s['title']}》记载：“{scored[0].strip()}” [{s['n']}]")
            if len(picked) >= 3:
                break
        if picked:
            lines.append("原文里的相关记载：")
            lines += [f"- {p}" for p in picked]
        lines.append("\n（当前未接入大模型，以上是从资料中摘编的要点；配置 API Key 后我可以把它们组织成完整回答。）")
        return "\n".join(lines)

    async def answer(self, question: str, history: list[dict], context_page: str | None) -> AsyncIterator[dict]:
        yield {"event": "status", "data": {"emotion": "thinking", "stage": "retrieving"}}
        retrieval = self.retrieve(question, context_page)
        sources = retrieval["sources"]
        public_sources = [{k: v for k, v in s.items() if k != "text"} | {"snippet": s["text"][:160]} for s in sources]
        yield {"event": "sources", "data": {"sources": public_sources, "entities": retrieval["entities"],
                                              "terms": retrieval["terms"], "dense": retrieval["dense"]}}
        emotion = self.emotion(question, sources)
        mode = "llm" if llm.settings.configured else "extractive"
        if mode == "llm":
            try:
                async for delta in llm.stream_chat(self.build_messages(question, sources, history)):
                    yield {"event": "delta", "data": {"text": delta}}
            except Exception as e:  # noqa: BLE001 - surface provider errors, then fall back
                yield {"event": "delta", "data": {"text": f"（大模型调用失败：{e}。下面先给出资料摘编。）\n\n"}}
                mode = "extractive"
                yield {"event": "delta", "data": {"text": self.extractive_answer(question, retrieval)}}
        else:
            text = self.extractive_answer(question, retrieval)
            for i in range(0, len(text), 12):
                yield {"event": "delta", "data": {"text": text[i:i + 12]}}
        yield {"event": "done", "data": {"emotion": emotion, "mode": mode}}
