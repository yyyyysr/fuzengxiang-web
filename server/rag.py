"""Retrieval-augmented answering over the wiki and the source corpus."""
from __future__ import annotations

import asyncio
import json
import math
import re
import threading
import time
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

# Questions about the website itself ("史料侦探怎么玩") are answered from wiki/guide pages.
GUIDE_HINTS = ("玩法", "怎么玩", "怎么用", "如何用", "如何使用", "使用说明", "功能", "栏目", "模块", "板块", "页面", "网站", "本站",
               "入口", "怎么操作", "如何操作", "规则", "导览", "能做什么", "有什么用", "怎么看", "怎么翻", "怎么打开", "是谁", "有哪些", "介绍",
               "怎么核对", "如何核对", "怎么查", "如何查")
GUIDE_MODULES = (  # checked in order; a matched name is removed so 认识傅增湘 does not also hit 傅增湘
    ("藏园长卷", "首页长卷玩法"), ("首页长卷", "首页长卷玩法"), ("长卷", "首页长卷玩法"), ("首页", "首页长卷玩法"), ("首屏", "首页长卷玩法"),
    ("认识傅增湘", "认识傅增湘栏目"), ("藏园故事", "藏园故事玩法"), ("史料侦探", "史料侦探玩法"), ("双鉴书架", "双鉴书架玩法"),
    ("书林往来", "书林往来玩法"), ("藏园图像", "藏园图像玩法"), ("全站检索", "全站检索玩法"), ("检书", "全站检索玩法"),
    ("快速跳转", "全站检索玩法"), ("命令面板", "全站检索玩法"), ("快捷键", "全站检索玩法"),
    ("年谱", "认识傅增湘栏目"), ("小傅", "小傅问答玩法"), ("检索", "全站检索玩法"), ("搜索", "全站检索玩法"),
    ("放映", "藏园故事玩法"), ("排序", "藏园故事玩法"), ("卷宗", "史料侦探玩法"), ("证据卡", "史料侦探玩法"),
    ("关系图", "书林往来玩法"), ("书架", "双鉴书架玩法"), ("图像", "藏园图像玩法"),
    ("出处", "全站检索玩法"), ("核对", "全站检索玩法"), ("阅读全文", "全站检索玩法"),
)
SITE_WORDS = ("网站", "本站", "栏目", "模块", "板块", "导览")

SYSTEM_PROMPT = """你是“小傅”，傅增湘藏书家智能体网站的当代导览伙伴。你不是傅增湘本人，不用第一人称冒充他。
回答规则：
1. 只依据下方【资料】作答，先给结论，再给依据；每个事实句后用 [编号] 标注出处，编号对应资料条目。
2. 区分证据层级：原始材料明载（题跋、书札、日记、档案）／研究者推断（论文考证）／现有材料不足。必要时在句末注明。
3. 区分作品、版本与具体藏本；区分旧藏、经眼、校勘、题跋、借阅、影印、捐赠，不把“经眼”说成“旧藏”。
4. 不补写心理活动，不推测未记载的结局；资料不足时直接说缺少什么材料，并建议读者查看哪条证据。
5. 用简体中文，语气亲切简洁，面向对古籍感兴趣的学生和普通读者，一般不超过 300 字。
6. 标为“网站说明”的资料介绍本网站的栏目与操作。回答“怎么玩、怎么用、有什么功能”时，按其中的步骤分条说明，照用界面上的按钮名称，同样标注 [编号]；这类回答不必区分证据层级，可适当展开到 400 字，不要描述资料里没有的功能。"""


def bigrams(text: str) -> set[str]:
    s = re.sub(r"[^\u4e00-\u9fff0-9]", "", fold(text))
    return {s[i:i + 2] for i in range(len(s) - 1)}


def guide_digest(body: str, limit: int = 18) -> list[str]:
    """Headings, list items and table rows of a guide page, with wiki links reduced to their labels."""
    lines = body.splitlines()
    out = []
    for i, line in enumerate(lines):
        s = line.strip()
        if s.startswith("## "):
            out += ["", f"**{s[3:]}**"]  # blank line so the heading does not merge into the previous list item
        elif re.match(r"^(\d+\.|-)\s", s):
            out.append(s)
        elif s.startswith("|") and not re.fullmatch(r"[|\-:\s]+", s):
            nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
            if re.fullmatch(r"[|\-:\s]+", nxt):
                continue  # header row
            cells = [c.strip() for c in s.strip("|").split("|")]
            out.append(f"- {cells[0]}：{cells[1]}" if len(cells) > 1 else f"- {cells[0]}")
        if sum(1 for x in out if x) >= limit:
            break
    while out and (not out[-1] or out[-1].startswith("**")):
        out.pop()  # a heading cut off from its items
    unlink = lambda t: re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\2", re.sub(r"\[\[([^\]|#]+)\]\]", r"\1", t))  # noqa: E731
    return [unlink(x) for x in out]


class Dense:
    """Optional embedding retrieval, loaded in the background so startup stays fast.

    Queries are encoded with data/index/onnx/model.onnx (onnxruntime + tokenizers, no torch)
    when present, otherwise with sentence-transformers. Corpus vectors are precomputed.
    """

    def __init__(self) -> None:
        self.ready = False
        self.error = ""
        self.backend = ""
        self.lock = threading.Lock()
        if config.ENABLE_DENSE and (config.INDEX / "embeddings.npy").exists():
            threading.Thread(target=self._load, daemon=True).start()
        else:
            self.error = "disabled or embeddings missing"

    def _load(self) -> None:
        try:
            import numpy as np
            meta = json.loads((config.INDEX / "embeddings_ids.json").read_text(encoding="utf-8"))
            self.meta = meta
            self.rows = meta["rows"]
            self.vecs = np.load(config.INDEX / "embeddings.npy").astype("float32")
            self.np = np
            onnx_dir = config.INDEX / "onnx"
            if (onnx_dir / "model.onnx").exists():
                import onnxruntime as ort
                from tokenizers import Tokenizer
                opts = ort.SessionOptions()
                opts.intra_op_num_threads = config.DENSE_THREADS  # leave cores for the web server
                opts.inter_op_num_threads = 1
                sess = ort.InferenceSession(str(onnx_dir / "model.onnx"), opts, providers=["CPUExecutionProvider"])
                tok = Tokenizer.from_file(str(onnx_dir / "tokenizer.json"))
                tok.enable_truncation(128)
                tok_doc = Tokenizer.from_file(str(onnx_dir / "tokenizer.json"))
                tok_doc.enable_truncation(512)  # passages were embedded at the model's full length

                def run(e):
                    feed = {"input_ids": np.array([e.ids], np.int64), "attention_mask": np.array([e.attention_mask], np.int64),
                            "token_type_ids": np.array([e.type_ids], np.int64)}
                    return sess.run(None, feed)[0][0]
                encode = lambda text: run(tok.encode(text))  # noqa: E731
                self.encode_doc = lambda text: run(tok_doc.encode(text))
                self.backend = "onnx"
            else:
                from modelscope import snapshot_download
                from sentence_transformers import SentenceTransformer
                model = SentenceTransformer(snapshot_download(meta["model"]))
                encode = lambda text: model.encode([text], normalize_embeddings=True)[0]  # noqa: E731
                self.encode_doc = encode
                self.backend = "sentence-transformers"
            encode("预热")
            self.encode = encode
            self.ready = True
        except Exception as e:  # noqa: BLE001 - optional component
            self.error = str(e)[:200]

    def upsert(self, items: list[tuple[str, str, str]]) -> int:
        """Embed (kind, id, passage) items, add or replace their rows and persist the index files."""
        if not self.ready:
            return 0
        np = self.np
        with self.lock:
            index = {(r["kind"], r["id"]): i for i, r in enumerate(self.rows)}
            vecs = self.vecs.copy()
            for kind, rid, text in items:
                v = np.asarray(self.encode_doc(text), dtype="float32")
                i = index.get((kind, rid))
                if i is None:
                    self.rows.append({"kind": kind, "id": rid})  # rows grow before vecs so a concurrent search never indexes past them
                    vecs = np.vstack([vecs, v[None]])
                    index[(kind, rid)] = len(self.rows) - 1
                else:
                    vecs[i] = v
            self.vecs = vecs
            np.save(config.INDEX / "embeddings.npy", vecs.astype(np.float16))
            (config.INDEX / "embeddings_ids.json").write_text(json.dumps({**self.meta, "rows": self.rows}, ensure_ascii=False), encoding="utf-8")
        return len(items)

    def remove(self, keep) -> int:
        """Drop every row for which keep(row) is false and persist the index files."""
        if not self.ready:
            return 0
        with self.lock:
            idx = [i for i, r in enumerate(self.rows) if keep(r)]
            dropped = len(self.rows) - len(idx)
            if dropped:
                vecs = self.vecs[idx]
                rows = [self.rows[i] for i in idx]
                self.vecs, self.rows = vecs, rows  # vecs first: a concurrent search then indexes the old, longer rows list
                self.np.save(config.INDEX / "embeddings.npy", vecs.astype(self.np.float16))
                (config.INDEX / "embeddings_ids.json").write_text(json.dumps({**self.meta, "rows": rows}, ensure_ascii=False), encoding="utf-8")
        return dropped

    def missing_wiki(self, page_ids) -> list[str]:
        have = {r["id"] for r in self.rows if r["kind"] == "wiki"} if self.ready else set()
        return [p for p in page_ids if p not in have]

    def search(self, query: str, k: int = 30) -> list[dict]:
        if not self.ready:
            return []
        q = self.encode("为这个句子生成表示以用于检索相关文章：" + query)
        scores = self.vecs @ q
        top = scores.argsort()[::-1][:k]
        return [{**self.rows[i], "sim": float(scores[i])} for i in top]


class RAG:
    def __init__(self, kb: KB) -> None:
        self.kb = kb
        self.dense = Dense()
        jieba.initialize()

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
        if p["type"] in ("story", "case", "event", "guide"):
            return core[:1] if inner else []
        return [c for c in core if len(c) >= 2][:2]

    def guide_pages(self, question: str) -> list[str]:
        """Guide pages for a how-to question about the site; [] when the question is about history."""
        q = fold(question)
        if not any(h in q for h in GUIDE_HINTS):
            return []
        hits = []
        for name, pid in GUIDE_MODULES:
            if name in q and pid in self.kb.pages:
                q = q.replace(name, " ")
                if pid not in hits:
                    hits.append(pid)
        if not hits and any(w in fold(question) for w in SITE_WORDS) and "网站导览" in self.kb.pages:
            hits.append("网站导览")
        return hits

    def retrieve(self, question: str, context_page: str | None = None) -> dict:
        result = {}
        for kind, payload in self.retrieve_steps(question, context_page):
            if kind == "result":
                result = payload
        return result

    def _doc_label(self, chunk_id: str) -> str:
        doc = chunk_id.split("#")[0]
        return self.kb.documents.get(doc, {}).get("title", doc)

    def retrieve_steps(self, question: str, context_page: str | None = None):
        """Run retrieval as a sequence of tool calls; yields ("tool", step) … then ("result", data)."""
        def step(tool, label, inp, out, t0, count=None):
            return ("tool", {"tool": tool, "label": label, "input": inp, "output": out,
                             "count": count, "ms": round((time.perf_counter() - t0) * 1000)})

        t0 = time.perf_counter()
        entities = self.kb.spot_entities(question)
        is_guide = lambda e: self.kb.pages[e]["type"] == "guide"  # noqa: E731
        guides = self.guide_pages(question)
        history = [e for e in entities if not is_guide(e) and e != "傅增湘"]
        # A how-to question names a module and nothing historical; "藏园故事里《乐府诗集》失火那天书在哪里"
        # mentions a module but asks about a book, so it stays a history question.
        site = bool(guides) and not history
        if not site and entities and all(is_guide(e) for e in entities) and not self.terms(question, entities):
            site, guides = True, entities  # the question is just a guide alias, e.g. "影院模式"
        entities = guides if site else [e for e in entities if not is_guide(e)]
        if context_page and context_page in self.kb.pages and context_page not in entities and not site:
            entities.append(context_page)
        yield step("entity_recognition", "识别问题中的实体" + ("（网站使用问题）" if site else ""), question,
                   [self.kb.pages[e]["title"] for e in entities] or ["未识别到知识库实体"], t0, len(entities))

        t0 = time.perf_counter()
        terms = self.terms(question, entities)
        names = []
        for e in entities:
            if e == "傅增湘":
                continue
            for n in self.entity_terms(e):
                if n not in names:
                    names.append(n)
        query_terms = (names + terms)[:8]
        yield step("query_terms", "提取检索词（繁简归一）", question, query_terms or ["（无）"], t0, len(query_terms))

        con = connect()
        fused: dict[tuple, float] = {}

        def add(key, rank, weight=1.0):
            fused[key] = fused.get(key, 0.0) + weight / (50 + rank)

        others = [e for e in entities if e != "傅增湘"]
        for i, e in enumerate(entities):
            add(("wiki", e), i, 0.6 if (e == "傅增湘" and (others or terms)) else 3.0)

        t0 = time.perf_counter()
        wiki_hits = []
        if query_terms:
            for i, w in enumerate(self.scored(con, "wiki_pages", "page_id", query_terms, 30, ", type")):
                if w["row"][2] != "meta" and (site or w["row"][2] != "guide"):
                    add(("wiki", w["id"]), i, 1.6 if w["row"][2] != "source" else 0.5)
                    wiki_hits.append(w["id"])
        yield step("wiki_search", "检索知识页（LLM Wiki）", query_terms,
                   [self.kb.pages[p]["title"] for p in wiki_hits[:6] if p in self.kb.pages], t0, len(wiki_hits))

        t0 = time.perf_counter()
        chunk_hits = []
        if query_terms and not site:
            for i, c in enumerate(self.scored(con, "chunks", "chunk_id", query_terms, 40, ", kind")):
                add(("chunk", c["id"]), i, 0.4 if c["row"][2] == "notes" else 1.4)
                chunk_hits.append(c["id"])
        yield step("corpus_search", "检索原文段落（IDF 加权全文检索）", query_terms,
                   ["网站使用问题，按网站说明作答，跳过史料原文"] if site else
                   list(dict.fromkeys(self._doc_label(c) for c in chunk_hits[:12]))[:6], t0, len(chunk_hits))

        t0 = time.perf_counter()
        def keep(d):
            if d["kind"] != "wiki":
                return not site
            return site or self.kb.pages.get(d["id"], {}).get("type") != "guide"
        dense = [d for d in self.dense.search(question) if keep(d)]
        for i, d in enumerate(dense):
            add((d["kind"], d["id"]), i, 1.2)
        yield step("vector_search", "语义向量召回", question,
                   [f"{self.kb.pages[d['id']]['title'] if d['kind'] == 'wiki' and d['id'] in self.kb.pages else self._doc_label(d['id'])}（{d['sim']:.2f}）"
                    for d in dense[:5]] if dense else ["未启用（服务器未加载嵌入模型）"], t0, len(dense))

        # The wiki already links its claims to source paragraphs: pull the paragraphs
        # cited by the best wiki pages in as evidence (bridges wording gaps like 水灾/大水).
        t0 = time.perf_counter()
        top_wiki = [] if site else [k[1] for k in sorted(fused, key=fused.get, reverse=True)
                                    if k[0] == "wiki" and k[1] in self.kb.pages and k[1] != "傅增湘"][:2]
        expanded = []
        for pid in top_wiki:
            for j, (doc, bid) in enumerate(self.cited_blocks(pid)[:4]):
                r = con.execute("SELECT chunk_id FROM chunks WHERE doc_id=? AND block_ids LIKE ?", (doc, f'%"{bid}"%')).fetchone()
                if r:
                    add(("chunk", r[0]), j, 2.0)
                    expanded.append(f"{self._doc_label(r[0])} #{bid}")
        yield step("citation_expand", "沿知识页出处补入原文", [self.kb.pages[p]["title"] for p in top_wiki],
                   expanded[:6] or ["（网站说明无需补入原文）" if site else "（无出处链接）"], t0, len(expanded))

        ranked = sorted(fused, key=fused.get, reverse=True)
        wiki_ids = [k[1] for k in ranked if k[0] == "wiki" and k[1] in self.kb.pages][:4]
        chunks, kept_grams = [], []
        for cid in [k[1] for k in ranked if k[0] == "chunk"][:20]:
            if len(chunks) >= 6:
                break
            r = con.execute("SELECT c.chunk_id, c.doc_id, c.heading, c.block_ids, c.page_start, c.text FROM chunks c WHERE c.chunk_id=?", (cid,)).fetchone()
            if r:
                g = bigrams(r["text"])
                # Many papers retell the same passage; keep one copy so other evidence gets the remaining slots.
                if any(len(g & k) / max(1, min(len(g), len(k))) > 0.6 for k in kept_grams):
                    continue
                kept_grams.append(g)
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
                            "summary": p["summary"], "text": body[:3200 if p["type"] == "guide" else 1400]})
        for c in chunks:
            sources.append({"n": len(sources) + 1, "kind": "chunk", "id": c["doc_id"], "bid": c["bid"], "page": c["page"],
                            "title": c["title"], "authors": c["authors"], "citation": c["citation"],
                            "heading": c["heading"], "text": c["text"][:900]})
        yield ("tool", {"tool": "rerank", "label": "RRF 融合排序，组装上下文", "input": f"{len(fused)} 个候选",
                        "output": [f"[{s['n']}] {s['title']}" for s in sources], "count": len(sources), "ms": 0})
        yield ("result", {"entities": entities, "terms": terms, "sources": sources, "dense": self.dense.ready, "site": site})

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
                label = "网站说明" if s.get("type") == "guide" else "wiki"
                ctx.append(f"[{s['n']}] {label}《{s['title']}》：{s['text']}")
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
        if retrieval.get("site"):
            top = sources[0]
            lines = [f"{top['summary']} [{top['n']}]"] + guide_digest(top["text"])
            more = [s for s in sources[1:] if s["kind"] == "wiki" and s.get("type") == "guide"][:2]
            if more:
                lines += ["", "相关说明：" + "、".join(f"《{s['title']}》[{s['n']}]" for s in more)]
            lines.append("\n（当前未接入大模型，以上摘自网站说明页；点编号可查看全文。）")
            return "\n".join(lines)
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
        retrieval = {}
        for kind, payload in self.retrieve_steps(question, context_page):
            if kind == "tool":
                yield {"event": "tool", "data": payload}
                await asyncio.sleep(0.05)  # let each step reach the browser as it happens
            else:
                retrieval = payload
        sources = retrieval["sources"]
        public_sources = [{k: v for k, v in s.items() if k != "text"} | {"snippet": s["text"][:160]} for s in sources]
        yield {"event": "sources", "data": {"sources": public_sources, "entities": retrieval["entities"],
                                              "terms": retrieval["terms"], "dense": retrieval["dense"]}}
        emotion = self.emotion(question, sources)
        mode = "llm" if llm.settings.configured else "extractive"
        if mode == "llm":
            yield {"event": "status", "data": {"emotion": "thinking", "stage": "generating", "model": llm.settings.model}}
            try:
                async for kind, delta in llm.stream_chat(self.build_messages(question, sources, history)):
                    yield {"event": "reasoning" if kind == "reasoning" else "delta", "data": {"text": delta}}
            except Exception as e:  # noqa: BLE001 - surface provider errors, then fall back
                yield {"event": "delta", "data": {"text": f"（大模型调用失败：{e}。下面先给出资料摘编。）\n\n"}}
                mode = "extractive"
                yield {"event": "delta", "data": {"text": self.extractive_answer(question, retrieval)}}
        else:
            plan = (f"未接入大模型，改用摘编模式。这是网站使用问题，直接摘取《{sources[0]['title']}》的要点和操作步骤。"
                    if retrieval.get("site") and sources else
                    f"未接入大模型，改用摘编模式：先取排名最高的知识页摘要作结论，"
                    f"再从 {sum(1 for s in sources if s['kind'] == 'chunk')} 段原文中挑出含检索词"
                    f"「{'、'.join(retrieval['terms'][:4]) or '实体名'}」的句子作依据，并标注出处编号。")
            for i in range(0, len(plan), 10):
                yield {"event": "reasoning", "data": {"text": plan[i:i + 10]}}
                await asyncio.sleep(0.01)
            text = self.extractive_answer(question, retrieval)
            for i in range(0, len(text), 12):
                yield {"event": "delta", "data": {"text": text[i:i + 12]}}
        yield {"event": "done", "data": {"emotion": emotion, "mode": mode}}
