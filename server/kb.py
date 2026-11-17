"""Read-only access to the knowledge base built in 藏书家智能体/knowledge_base."""
from __future__ import annotations

import json
import re
import sqlite3
from functools import lru_cache

import opencc

from config import EXPORT, INDEX

CC = opencc.OpenCC("t2s")
LINK = re.compile(r"\[\[([^\]|#\\]+)(?:#(\^?[^\]|\\]+))?(?:\\?\|([^\]]+))?\]\]")
DOC_ID = re.compile(r"^(cnki|wanfang|vip|book|web|img|sup)-\d{4}$")


def fold(s: str) -> str:
    return CC.convert(s or "")


def _load(name: str):
    return json.loads((EXPORT / name).read_text(encoding="utf-8"))


class KB:
    def __init__(self) -> None:
        self.reload()

    def reload(self) -> None:
        self.pages = {p["id"]: p for p in _load("wiki/pages.json")}
        self.documents = {d["doc_id"]: d for d in _load("documents.json")}
        self.images = _load("images.json")
        self.timeline = _load("wiki/timeline.json")
        self.graph = _load("wiki/graph.json")
        self.alias_index = self._build_alias_index()
        self.mention_totals = self._mention_totals()
        _doc.cache_clear()

    def _mention_totals(self) -> dict[str, tuple[int, int]]:
        """entity id -> (occurrences, documents) over the deduplicated corpus."""
        try:
            con = connect()
            rows = con.execute("SELECT entity_id, SUM(count), COUNT(DISTINCT doc_id) FROM mentions GROUP BY entity_id").fetchall()
            con.close()
        except sqlite3.Error:
            return {}
        return {r[0]: (int(r[1]), int(r[2])) for r in rows}

    # ---- helpers -------------------------------------------------------
    def _build_alias_index(self) -> list[tuple[str, str]]:
        """(folded alias, page id) sorted longest first, for entity spotting in questions."""
        pairs = {}
        for p in self.pages.values():
            if p["type"] in ("source", "meta"):
                continue
            blocked = set(p["frontmatter"].get("ambiguous_aliases") or [])
            names = [p["title"], p["id"], *p.get("aliases", [])]
            if p["type"] in ("book", "work"):
                names += re.findall(r"《([^》]+)》", p["title"])
            for name in names:
                name = fold(str(name)).strip()
                if len(name) >= 2 and name not in blocked:
                    pairs.setdefault(name, p["id"])
        return sorted(pairs.items(), key=lambda kv: -len(kv[0]))

    def spot_entities(self, text: str) -> list[str]:
        t = fold(text)
        found = []
        for alias, pid in self.alias_index:
            if alias in t and pid not in found:
                found.append(pid)
                t = t.replace(alias, " ")
        return found

    def link_label(self, target: str) -> str:
        if target in self.pages:
            return self.pages[target]["title"]
        if target in self.documents:
            return self.documents[target]["title"]
        return target

    def page_card(self, pid: str) -> dict | None:
        p = self.pages.get(pid)
        if not p:
            return None
        fm = p["frontmatter"]
        return {"id": p["id"], "type": p["type"], "title": p["title"], "summary": p["summary"],
                "aliases": p.get("aliases", []), "status": fm.get("status", ""), "date": str(fm.get("date", "") or "")}

    # ---- pages ---------------------------------------------------------
    def page(self, pid: str) -> dict | None:
        p = self.pages.get(pid)
        if not p:
            return None
        return {**p, "sections": split_sections(p["body"]),
                "link_titles": {t: self.link_label(t) for t in set(p["links"]) | set(p.get("source_refs", []))},
                "backlink_cards": [c for c in (self.page_card(b) for b in p.get("backlinks", [])) if c and c["type"] not in ("meta",)],
                "mentioned_docs": [{"doc_id": d, "count": n, "title": self.documents.get(d, {}).get("title", d)}
                                   for d, n in p.get("mentioned_in", [])[:20]]}

    def by_type(self, t: str) -> list[dict]:
        return [p for p in self.pages.values() if p["type"] == t]

    def stories(self) -> list[dict]:
        out = []
        for p in self.by_type("story"):
            fm = p["frontmatter"]
            out.append({**self.page_card(p["id"]), "rank": fm.get("story_rank", 99), "themes": fm.get("themes", []),
                        "evidence_level": fm.get("evidence_level", ""), "date_end": str(fm.get("date_end", "") or ""),
                        "one_liner": one_liner(p["body"]), "images": fm.get("images", [])})
        return sorted(out, key=lambda s: s["rank"])

    def story(self, sid: str) -> dict | None:
        p = self.pages.get(sid)
        if not p or p["type"] != "story":
            return None
        secs = split_sections(p["body"])
        acts = []
        mode = "acts"
        for row in first_table(secs, ("情节（四幕）", "情节", "情节卡", "情节卡（四幕）", "情节卡（待补全）", "时间线")):
            if "内容" in row:
                acts.append({"label": row.get("标题") or row.get("幕", ""), "text": row["内容"], "source": row.get("出处", "")})
                continue
            vals = list(row.values())
            acts.append({"label": vals[0], "text": vals[1] if len(vals) > 1 else "", "source": vals[2] if len(vals) > 2 else ""})
        if not acts:
            # Hands-on stories (e.g. reading collation marks) carry a 符号 table instead of plot acts.
            for row in first_table(secs, ("校勘方法", "校勘方法（已核）")):
                vals = list(row.values())
                cite = next((m.group(0) for m in LINK.finditer(p["body"]) if m.group(2)), "")
                acts.append({"label": vals[0], "text": f"{vals[1]}　例：{vals[2]}" if len(vals) > 2 and vals[2] != "见原文" else vals[1],
                             "source": cite, "images": re.findall(r"(?:web|img)-\d{4}", vals[3] if len(vals) > 3 else "")})
            mode = "symbols" if acts else mode
        fm = p["frontmatter"]
        return {**self.page(sid), "rank": fm.get("story_rank"), "one_liner": one_liner(p["body"]), "acts": acts, "mode": mode,
                "people_notes": section_text(secs, ("故事里的人", "文中人物")),
                "notes": section_text(secs, ("史料小注",)), "full_text": section_text(secs, ("故事全文",)),
                "images": [img for img in self.images if img["id"] in (fm.get("images") or [])]}

    def tales(self) -> list[dict]:
        """Datable events told as short vernacular stories (the 藏园故事 page lists those without a feature story)."""
        out = []
        for p in self.by_type("event"):
            fm = p["frontmatter"]
            secs = split_sections(p["body"])
            story = secs.get("故事", "")
            if fm.get("story") or not story:
                continue
            teaser = re.sub(r"（[^）]*\[\[[^）]*）", "", story)
            teaser = re.sub(r"\s+", "", LINK.sub(lambda m: m.group(3) or self.link_label(m.group(1)), teaser))
            out.append({"id": p["id"], "title": fm.get("tale") or p["title"], "event": p["title"], "date": str(fm.get("date", "")),
                        "teaser": teaser[:96] + ("……" if len(teaser) > 96 else ""),
                        "story": story, "people": secs.get("文中人物", ""),
                        "link_titles": {t: self.link_label(t) for t in set(p["links"]) | set(p.get("source_refs", []))}})
        return sorted(out, key=lambda t: t["date"])

    def cases(self) -> list[dict]:
        out = []
        for p in self.by_type("case"):
            fm = p["frontmatter"]
            out.append({**self.page_card(p["id"]), "rank": fm.get("case_rank", 99), "question": fm.get("question", ""),
                        "hypotheses": fm.get("hypotheses", []), "case_status": fm.get("status", "")})
        return sorted(out, key=lambda c: c["rank"])

    def case(self, cid: str) -> dict | None:
        p = self.pages.get(cid)
        if not p or p["type"] != "case":
            return None
        secs = split_sections(p["body"])
        rows = first_table(secs, ("史料卡", "证据卡", "数字卡（每个数字都要标注时点与范围）", "数字卡"))
        numbers = bool(rows) and "数字" in rows[0]
        evidence = []
        for row in rows:
            get = lambda *keys: next((row[k] for k in keys if row.get(k)), "")  # noqa: E731
            evidence.append({"key": get("卡", "编号", "数字"), "quote": get("史料", "原文", "原文摘录"), "text": get("说明", "内容"),
                             "points": get("指向").strip().upper()[:1], "reading": get("研究者解读", "支持"), "source": get("出处"),
                             "when": get("时点"), "scope": get("范围")})
        fm = p["frontmatter"]
        hyps = fm.get("hypotheses", [])
        labels = fm.get("hypothesis_labels") or [re.split(r"[：:，,]", h)[0][:12] for h in hyps]
        return {**self.page(cid), "question": fm.get("question", ""), "hypotheses": hyps, "labels": labels,
                "case_status": fm.get("status", ""), "numbers": numbers, "evidence": evidence,
                "background": section_text(secs, ("案情", "案情背景")),
                "hypothesis_text": section_text(secs, ("竞争解释",)), "hints": section_text(secs, ("推理提示", "推理步骤")),
                "conclusion": section_text(secs, ("结论", "当前结论", "结论（研究者考证）")), "why": section_text(secs, ("为什么旧说看似合理",)),
                "open_questions": section_text(secs, ("仍待查证", "待核"))}

    def books(self) -> list[dict]:
        out = []
        for p in self.by_type("book") + self.by_type("work"):
            fm = p["frontmatter"]
            rels = fm.get("relations") or []
            out.append({**self.page_card(p["id"]), "work": fm.get("work", ""), "edition": fm.get("edition", ""),
                        "current_holder": fm.get("current_holder", ""), "category": fm.get("category", ""), "relations": rels,
                        "relation_types": sorted({r.get("type") for r in rels if isinstance(r, dict)}),
                        "images": fm.get("images", [])})
        return out

    def people(self) -> list[dict]:
        out = []
        for p in self.by_type("person"):
            fm = p["frontmatter"]
            out.append({**self.page_card(p["id"]), "birth": fm.get("birth"), "death": fm.get("death"),
                        "roles": fm.get("roles", []), "relations": fm.get("relations") or [],
                        "relation_types": fm.get("relation_types", [])})
        return out

    def network(self) -> dict:
        """People, books, projects, institutions and places with three kinds of edges:
        `relation` (structured relations with evidence), `event` (named together in one event or story page)
        and `link` (one entity page cites the other)."""
        nodes = {}
        for t in ("person", "book", "work", "org", "place"):
            for p in self.by_type(t):
                nodes[p["id"]] = {"id": p["id"], "type": t, "title": p["title"], "summary": p["summary"],
                                  "mentions": p.get("mention_total", 0), "docs": p.get("mention_doc_count", 0)}
        edges, pairs = [], set()
        for e in self.graph["edges"]:
            if e.get("kind") == "relation" and e["source"] in nodes and e["target"] in nodes and e["source"] != e["target"]:
                edges.append(e)
                pairs.add(frozenset((e["source"], e["target"])))
        for p in self.by_type("event") + self.by_type("story"):
            ents = [t for t in dict.fromkeys(p["links"]) if t in nodes][:7]
            date = str(p["frontmatter"].get("date", "") or "")
            for i, a in enumerate(ents):
                for b in ents[i + 1:]:
                    key = frozenset((a, b))
                    if key in pairs:
                        continue
                    pairs.add(key)
                    edges.append({"source": a, "target": b, "type": "同见一事", "kind": "event", "label": p["title"], "date": date,
                                  "via": p["id"], "via_type": p["type"], "evidence": []})
        for p in self.pages.values():
            if p["id"] not in nodes:
                continue
            for tgt in p["links"]:
                key = frozenset((p["id"], tgt))
                if tgt in nodes and tgt != p["id"] and key not in pairs:
                    pairs.add(key)
                    edges.append({"source": p["id"], "target": tgt, "type": "提及", "kind": "link", "label": "", "date": "", "evidence": []})
        linked = {e["source"] for e in edges} | {e["target"] for e in edges}
        return {"nodes": [n for n in nodes.values() if n["id"] in linked or n["type"] == "person"], "edges": edges}

    def doc(self, doc_id: str) -> dict | None:
        return _doc(doc_id)

    # ---- full-text search ------------------------------------------------
    def search(self, q: str, limit: int = 20) -> dict:
        terms = [t for t in re.split(r"\s+", fold(q).strip()) if t]
        if not terms:
            return {"wiki": [], "chunks": []}
        con = connect()
        wiki = fts_query(con, "wiki_pages", "wiki_fts", terms, "page_id, type, title, summary", limit)
        chunks = fts_query(con, "chunks", "chunks_fts", terms,
                           "chunk_id, doc_id, kind, heading, block_ids, page_start, page_end, text", limit * 2)
        for c in chunks:
            d = self.documents.get(c["doc_id"], {})
            c.update(title=d.get("title", ""), authors=d.get("authors", []), year=d.get("year", ""),
                     citation=d.get("citation", ""), block_ids=json.loads(c["block_ids"]))
        con.close()
        wiki = [w for w in wiki if w["type"] not in ("meta",)]
        return {"wiki": wiki[:limit], "chunks": chunks[:limit]}


@lru_cache(maxsize=64)
def _doc(doc_id: str) -> dict | None:
    if not DOC_ID.match(doc_id):
        return None
    p = EXPORT / "docs" / f"{doc_id}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{INDEX / 'kb.sqlite'}?mode=ro", uri=True, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con


def fts_query(con, table: str, fts: str, terms: list[str], cols: str, limit: int, mode: str = "AND") -> list[dict]:
    long_terms = [t for t in terms if len(t) >= 3]
    short_terms = [t for t in terms if len(t) < 3]
    where, params = [], []
    if long_terms:
        joiner = f" {mode} "
        where.append(f"t.rowid IN (SELECT rowid FROM {fts} WHERE {fts} MATCH ?)")
        params.append(joiner.join('"' + t.replace('"', '""') + '"' for t in long_terms))
    if short_terms:
        cond = [f"t.fold LIKE ?" for _ in short_terms]
        where.append("(" + (" AND " if mode == "AND" else " OR ").join(cond) + ")")
        params += [f"%{t}%" for t in short_terms]
    if not where:
        return []
    glue = " AND " if mode == "AND" else " OR "
    sql = f"SELECT {cols}, t.fold FROM {table} t WHERE " + glue.join(where) + " LIMIT 400"
    rows = [dict(r) for r in con.execute(sql, params)]
    for r in rows:
        f = r.pop("fold")
        r["score"] = sum(min(f.count(t), 6) * (1 + len(t) / 4) for t in terms) * (0.3 if r.get("kind") == "notes" else 1.0)
    rows.sort(key=lambda r: -r["score"])
    return rows[:limit]


# ---- markdown helpers ----------------------------------------------------
def split_sections(body: str) -> dict[str, str]:
    secs, cur, buf = {}, "_intro", []
    for line in body.splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            secs[cur] = "\n".join(buf).strip()
            cur, buf = m.group(1).strip(), []
        else:
            buf.append(line)
    secs[cur] = "\n".join(buf).strip()
    return secs


def section_text(secs: dict, names: tuple) -> str:
    for n in names:
        if secs.get(n):
            return secs[n]
    return ""


def parse_table(md: str) -> list[dict]:
    lines = [l for l in md.splitlines() if l.strip().startswith("|")]
    if len(lines) < 3:
        return []

    def cells(line):
        line = line.strip().strip("|")
        parts, cur, depth = [], "", 0
        i = 0
        while i < len(line):
            ch = line[i]
            if line.startswith("[[", i):
                depth += 1
            if line.startswith("]]", i):
                depth = max(0, depth - 1)
            if ch == "\\" and i + 1 < len(line) and line[i + 1] == "|":
                cur += "|"
                i += 2
                continue
            if ch == "|" and depth == 0:
                parts.append(cur.strip())
                cur = ""
            else:
                cur += ch
            i += 1
        parts.append(cur.strip())
        return parts

    head = cells(lines[0])
    rows = []
    for l in lines[2:]:
        vals = cells(l)
        rows.append({head[i] if i < len(head) else f"c{i}": v for i, v in enumerate(vals)})
    return rows


def first_table(secs: dict, names: tuple) -> list[dict]:
    for n in names:
        if secs.get(n):
            t = parse_table(secs[n])
            if t:
                return t
    return []


def one_liner(body: str) -> str:
    m = re.search(r"\*\*一句话\*\*[：:]\s*(.+)", body)
    return m.group(1).strip() if m else ""
