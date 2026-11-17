"""后台 wiki 补充: draft a wiki page from source material with the LLM, write it into the knowledge
base and refresh everything the site and 小傅 read (wiki tables, mention counts, JSON exports,
vectors) without re-running the corpus pipeline.

Uploaded raw material becomes a citable source document `sup-NNNN`. Everything committed here is
also kept in ADMIN_DATA (outside the deployed knowledge base) and re-applied after a redeploy.
"""
from __future__ import annotations

import base64
import datetime as dt
import importlib
import importlib.util
import io
import json
import re
import sqlite3
import sys
import threading
import time
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml

import config
import llm
from kb import KB, connect, fold

TYPE_DIRS = {"person": "people", "book": "books", "work": "works", "place": "places", "org": "orgs", "event": "events", "concept": "concepts"}
TYPE_NAMES = {"person": "人物", "book": "书籍（具体版本或藏本）", "work": "傅增湘的著述、编纂或影印项目", "place": "地点",
              "org": "机构", "event": "可定年的事件", "concept": "版本学、校勘学术语"}
REL_TYPES = ["旧藏", "经眼", "校勘", "题跋", "借阅", "影印", "捐赠", "出让", "购藏", "递藏", "书札往来", "同事", "师友", "荐举",
             "合作编纂", "访书", "亲属", "品评", "交游", "任职", "收藏"]
FM_KEYS = ("birth", "death", "native_place", "roles", "relation_types", "work", "edition", "current_holder", "category",
           "date", "date_end", "date_precision", "themes", "participants", "books", "places")
UPLOAD = "sup-new"
DOC_REF = r"(?:cnki|wanfang|vip|book|web|img|sup)-(?:\d{4}|new)"
REF = re.compile(rf"\[\[({DOC_REF})#\^(b\d{{4}})(?:\\?\|([^\]]+))?\]\]")
BARE_REF = re.compile(rf"({DOC_REF})#\^?(b\d{{4}})")
PAGE_LINK = re.compile(r"\[\[([^\]|#\\]+)(?:\\?\|([^\]]+))?\]\]")
FOCUS = ("傅增湘", "沅叔", "藏园", "双鉴")
BAD_ID = re.compile(r'[\\/:*?"<>|\s#\[\]]+')


def _admin_dir() -> Path:
    import os
    return Path(os.environ.get("ADMIN_DATA") or config.KB_ROOT / "data" / "admin")


def pipeline_wiki():
    """The pipeline's kb.wiki, loaded as package `kbpipe` because the server already has a module named `kb`."""
    if "kbpipe.wiki" in sys.modules:
        return sys.modules["kbpipe.wiki"]
    init = config.PIPELINE / "kb" / "__init__.py"
    spec = importlib.util.spec_from_file_location("kbpipe", init, submodule_search_locations=[str(init.parent)])
    mod = importlib.util.module_from_spec(spec)
    sys.modules["kbpipe"] = mod
    spec.loader.exec_module(mod)
    return importlib.import_module("kbpipe.wiki")


def today() -> str:
    return dt.date.today().isoformat()


# ---- raw material -----------------------------------------------------------
def extract_text(name: str, data: bytes) -> str:
    ext = Path(name).suffix.lower()
    if ext == ".docx":
        w = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
        root = ET.fromstring(zipfile.ZipFile(io.BytesIO(data)).read("word/document.xml"))
        return "\n\n".join("".join(t.text or "" for t in p.iter(f"{w}t")) for p in root.iter(f"{w}p"))
    if ext == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as e:
            raise ValueError("服务器未安装 PDF 解析库 pypdf，请改传 txt / docx，或直接粘贴文字") from e
        return "\n\n".join((pg.extract_text() or "") for pg in PdfReader(io.BytesIO(data)).pages)
    if ext in (".txt", ".md", ".csv", ".json", ""):
        for enc in ("utf-8-sig", "gb18030"):
            try:
                return data.decode(enc)
            except UnicodeDecodeError:
                continue
    raise ValueError(f"暂不支持 {ext} 文件，请上传 txt、md、docx 或 pdf")


def split_blocks(text: str) -> list[str]:
    """Paragraphs for citation anchors: blank-line separated when the text has them, else one per line."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    parts = re.split(r"\n\s*\n", text) if len(re.findall(r"\n\s*\n", text)) >= 2 else text.split("\n")
    parts = [re.sub(r"[ \t\u3000]+", " ", p.replace("\n", "")).strip() for p in parts]
    out: list[str] = []
    for p in (x for x in parts if x):
        if out and len(out[-1]) < 30 and not re.search(r"[。！？；:：]$", out[-1]):
            out[-1] += p
            continue
        while len(p) > 800:
            cut = max(p.rfind("。", 0, 700), p.rfind("；", 0, 700))
            cut = cut + 1 if cut > 200 else 700
            out.append(p[:cut])
            p = p[cut:]
        out.append(p)
    return out[:400]


def short_cite(title: str, authors: list[str], page) -> str:
    who = authors[0] if authors else re.sub(r"[《》“”]", "", title)[:10]
    return f"{who} p.{page}" if page else who


def sanitize_id(s: str) -> str:
    return BAD_ID.sub("", s.strip())[:40]


class WikiAdmin:
    def __init__(self, kb: KB, rag) -> None:
        self.kb = kb
        self.rag = rag
        self.lock = threading.Lock()
        self.dir = _admin_dir()
        self.reconcile_note = ""
        threading.Thread(target=self.reconcile, daemon=True).start()

    # ---- bookkeeping ----------------------------------------------------------
    @property
    def enabled(self) -> bool:
        return bool(config.ADMIN_TOKEN) and (config.PIPELINE / "kb" / "wiki.py").exists()

    def manifest(self) -> list[dict]:
        p = self.dir / "manifest.json"
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else []

    def _save_manifest(self, items: list[dict]) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        (self.dir / "manifest.json").write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")

    def match_page(self, title: str, ptype: str | None = None) -> str | None:
        t = fold(title.strip())
        for p in self.kb.pages.values():
            if p["type"] in ("source", "meta") or (ptype and p["type"] != ptype):
                continue
            if t in {fold(p["id"]), fold(p["title"]), *(fold(a) for a in p.get("aliases", []))}:
                return p["id"]
        return None

    def page_file(self, pid: str) -> Path | None:
        p = self.kb.pages.get(pid)
        if p and p.get("path"):
            f = config.KB_ROOT / p["path"]
            return f if f.exists() else None
        hits = list(config.WIKI.rglob(f"{pid}.md"))
        return hits[0] if hits else None

    # ---- materials --------------------------------------------------------------
    def find_materials(self, terms: list[str], limit: int = 24) -> list[dict]:
        terms = [t for t in dict.fromkeys(fold(t).strip() for t in terms) if len(t) >= 2]
        if not terms:
            return []
        con = connect()
        where = " OR ".join("fold LIKE ?" for _ in terms)
        rows = con.execute(f"SELECT doc_id, block_ids FROM chunks WHERE kind != 'notes' AND ({where}) LIMIT 800",
                           [f"%{t}%" for t in terms]).fetchall()
        by_doc: dict[str, list[str]] = {}
        for r in rows:
            by_doc.setdefault(r["doc_id"], []).extend(json.loads(r["block_ids"]))
        cands = []
        for doc, bids in by_doc.items():
            q = f"SELECT bid, page, type, text FROM blocks WHERE doc_id=? AND bid IN ({','.join('?' * len(bids))})"
            for b in con.execute(q, [doc, *bids]):
                if b["type"] in ("reference", "image", "table", "byline"):
                    continue
                f = fold(b["text"])
                hits = sum(min(f.count(t), 4) for t in terms)
                if not hits or len(f) < 24:
                    continue
                score = hits * 2 + (3 if any(x in f for x in FOCUS) else 0) + min(len(f), 400) / 200
                cands.append((score, doc, b))
        con.close()
        cands.sort(key=lambda c: -c[0])
        out, per_doc, grams = [], {}, []
        for _score, doc, b in cands:
            if per_doc.get(doc, 0) >= 3:
                continue
            g = {b["text"][i:i + 2] for i in range(len(b["text"]) - 1)}
            if any(len(g & k) / max(1, min(len(g), len(k))) > 0.6 for k in grams):
                continue
            grams.append(g)
            per_doc[doc] = per_doc.get(doc, 0) + 1
            out.append(self._material(doc, b["bid"], b["page"], b["text"]))
            if len(out) >= limit:
                break
        return out

    def _material(self, doc: str, bid: str, page, text: str) -> dict:
        d = self.kb.documents.get(doc, {})
        return {"ref": f"{doc}#^{bid}", "doc_id": doc, "bid": bid, "page": page, "title": d.get("title", doc),
                "authors": d.get("authors", []), "cite": short_cite(d.get("title", doc), d.get("authors", []), page),
                "text": re.sub(r"<[^>]+>", "", text)[:700]}

    def materials_by_refs(self, refs: list[str]) -> list[dict]:
        con = connect()
        out = []
        for ref in dict.fromkeys(refs):
            m = BARE_REF.fullmatch(ref.strip().strip("[]"))
            if not m or m.group(1) == UPLOAD:
                continue
            r = con.execute("SELECT page, text FROM blocks WHERE doc_id=? AND bid=?", (m.group(1), m.group(2))).fetchone()
            if r:
                out.append(self._material(m.group(1), m.group(2), r["page"], r["text"]))
        con.close()
        return out

    @staticmethod
    def upload_materials(upload: dict | None) -> list[dict]:
        if not upload or not (upload.get("text") or "").strip():
            return []
        name = upload.get("title") or upload.get("name") or "上传资料"
        return [{"ref": f"{UPLOAD}#^b{i:04d}", "doc_id": UPLOAD, "bid": f"b{i:04d}", "page": None, "title": name,
                 "authors": [upload["author"]] if upload.get("author") else [], "cite": upload.get("author") or name[:10], "text": t[:700]}
                for i, t in enumerate(split_blocks(upload["text"]), 1)]

    # ---- drafting -----------------------------------------------------------------
    def _system_prompt(self, ptype: str, example: dict) -> str:
        extra = {
            "person": "人物页重点写与傅增湘的具体交集（时间、地点、经过），不是泛泛的生平。frontmatter 给出 birth、death（年份，未知写 null）、roles（身份数组）、relation_types（与傅增湘的交集类型）。",
            "book": "书籍页必须落到具体版本或藏本，写清版本、递藏、傅增湘与此本的关系；给出 work（作品名）、edition（版本描述）、current_holder（现藏地，未核实写“待核”）、category（经/史/子/集/丛 之一）。",
            "event": "事件页给出 date（YYYY 或 YYYY-MM-DD）、themes（藏书|校书|教育|图书馆|影印|交游|游历|生平 中选）、participants（人物，写成 [[页面id]]）。正文用“## 故事”一节以白话把事情讲完整（起因、经过、结果），再用“## 文中人物”一节为出现的人物各写一句简介。",
            "org": "机构页写清机构是什么、与傅增湘的具体往来。",
            "place": "地点页写清位置、用途、与傅增湘的关系。",
            "work": "著述/项目页写清内容、编纂或影印经过、傅增湘的角色。",
            "concept": "概念页写清定义与本站的用法，举材料中的例子。",
        }[ptype]
        return f"""你是“傅增湘知识库”（LLM Wiki）的维护者，负责把资料整理成一页规范的 wiki 词条，输出一个 JSON 对象。
写作规则：
1. 只写【资料】里有依据的内容。每个事实句末尾紧跟出处，例如依据第一条资料就写（[[{example['ref']}|{example['cite']}]]）：双方括号里先照抄该条资料方括号中的编号，竖线后写它的“简称”。严禁编造编号或引用资料之外的内容。
2. 区分证据层级：傅氏题跋、书札、日记、档案原文属“原始材料明载”，论文作者的考证属“研究者推断”；必要时在句中说明“据某文”。材料互相矛盾时并列写出，归入“## 说法不一”一节。
3. 不补写心理活动，不推测未记载的结局；书要落到具体版本；“经眼”不能写成“旧藏”。
4. 人名、书名第一次出现时，如果在【已有页面】中，写成 [[页面id]]；不在列表里的直接写名字，不要加方括号。
5. 正文为简体中文 Markdown：第一行写“**一句话**：……”（一句话概括）；其后用二级标题组织（如 ## 生平简介、## 与傅增湘的交集、## 相关藏书与事件、## 说法不一），没有材料的节省略。不要写一级标题，不要写“已核”“待核”“审核”之类的状态词。
6. relations 数组列出与【已有页面】的结构化关系，每条 {{"target": 页面id, "type": 关系类型, "label": 十几个字的说明, "date": 年份或约数, "evidence": [REF, ...]}}；type 只能取：{"、".join(REL_TYPES)}。没有材料支撑的关系不要写。
7. summary 不超过 60 字，用于卡片和检索。正文控制在 600—1500 字，挑最能说明问题的材料写，不必用尽所有资料。
8. {extra}
输出 JSON 字段：id（词条名，通常与 title 相同；事件以“年份-”开头）、type、title、aliases（字号、别名、繁体写法的数组）、summary、relations、body，以及上面提到的类型专属字段。"""

    def _user_prompt(self, title: str, ptype: str, aliases: list[str], notes: str, materials: list[dict], existing_md: str) -> str:
        known = [p for p in self.kb.pages.values() if p["type"] in ("person", "book", "work", "place", "org", "event", "story", "concept")]
        known_txt = "、".join(p["id"] if p["id"] == p["title"] else f"{p['id']}（{p['title']}）" for p in known)
        mats = "\n\n".join(f"[{m['ref']}] 简称：{m['cite']}｜《{m['title']}》{('（' + '、'.join(m['authors']) + '）') if m['authors'] else ''}\n{m['text']}"
                           for m in materials)
        parts = [f"词条：{title}", f"类型：{ptype}（{TYPE_NAMES[ptype]}）"]
        if aliases:
            parts.append("已知别名：" + "、".join(aliases))
        if notes.strip():
            parts.append("编者补充说明（不是史料，不能当出处）：" + notes.strip())
        if existing_md:
            parts.append("【现有页面】（请在其基础上合并补充，保留已有的正确内容和出处，输出完整的新版本）：\n" + existing_md[:6000])
        parts.append("【已有页面】" + known_txt)
        parts.append("【资料】\n" + mats)
        return "\n\n".join(parts)

    async def draft(self, req: dict) -> dict:
        title = (req.get("title") or "").strip()
        ptype = req.get("type") or "person"
        if not title:
            raise ValueError("请填写词条名称")
        if ptype not in TYPE_DIRS:
            raise ValueError("不支持的词条类型")
        if not llm.settings.configured:
            raise ValueError("服务器尚未配置大模型 API Key，无法自动整理")
        materials = self.materials_by_refs(req.get("refs") or []) + self.upload_materials(req.get("upload"))
        if not materials:
            raise ValueError("请至少勾选一条知识库资料，或上传 / 粘贴一段原始资料")
        existing = self.match_page(title, ptype)
        existing_md = ""
        if existing and req.get("mode", "merge") == "merge":
            f = self.page_file(existing)
            existing_md = f.read_text(encoding="utf-8") if f else ""
        aliases = [a.strip() for a in re.split(r"[,，、;；\s]+", req.get("aliases") or "") if a.strip()]
        t0 = time.perf_counter()
        messages = [{"role": "system", "content": self._system_prompt(ptype, materials[0])},
                    {"role": "user", "content": self._user_prompt(title, ptype, aliases, req.get("notes") or "", materials, existing_md)}]
        try:
            data = await llm.complete_json(messages)
        except RuntimeError as e:
            if "截断" in str(e):
                raise
            data = await llm.complete_json(messages)  # an occasional empty or malformed reply; one retry usually succeeds
        page, warnings = self.validate(data, title, ptype, aliases, materials, existing, existing_md)
        return {"markdown": self.compose(page), "id": page["fm"]["id"], "type": ptype, "existing": existing,
                "warnings": warnings, "materials": len(materials), "seconds": round(time.perf_counter() - t0, 1), "model": llm.settings.model}

    def validate(self, data: dict, title: str, ptype: str, aliases: list[str], materials: list[dict],
                 existing: str | None, existing_md: str) -> tuple[dict, list[str]]:
        warnings: list[str] = []
        if isinstance(data.get("frontmatter"), dict):
            data = {**data.pop("frontmatter"), **data}
        allowed = {m["ref"] for m in materials} | {f"{a}#^{b}" for a, b in BARE_REF.findall(existing_md)}
        cites = {m["ref"]: m["cite"] for m in materials}
        pid = existing or sanitize_id(str(data.get("id") or title)) or sanitize_id(title)
        if ptype == "event" and not re.match(r"^\d{4}-", pid):
            year = str(data.get("date") or "")[:4]
            if year.isdigit():
                pid = f"{year}-{pid}"
        body = str(data.get("body") or "").strip()
        body = re.sub(r"^#\s.*\n+", "", body)

        dropped = set()

        def fix_ref(m):
            ref = f"{m.group(1)}#^{m.group(2)}"
            if ref in allowed:
                return f"[[{ref}|{m.group(3) or cites.get(ref, '出处')}]]"
            dropped.add(ref)
            return ""
        body = REF.sub(fix_ref, body)
        if dropped:
            warnings.append(f"删去了 {len(dropped)} 处资料中不存在的出处编号：{'、'.join(sorted(dropped))[:120]}")

        unlinked = set()

        def fix_link(m):
            tgt, label = m.group(1).strip(), m.group(2)
            if tgt in self.kb.pages or tgt == pid or re.fullmatch(DOC_REF, tgt):
                return m.group(0)
            unlinked.add(tgt)
            return label or tgt
        body = PAGE_LINK.sub(fix_link, body)
        if unlinked:
            warnings.append("这些名字知识库里还没有页面，已改为普通文字：" + "、".join(sorted(unlinked))[:120])
        body = re.sub(r"（\s*[；;、，,\s]*）", "", body)
        uncited = [p for p in re.split(r"\n\s*\n", body) if len(p) > 60 and not p.lstrip().startswith(("#", "|", "**一句话**")) and "[[" not in p]
        if uncited:
            warnings.append(f"有 {len(uncited)} 段较长的文字没有出处，请检查后再写入")

        old_fm = {}
        if existing_md.startswith("---"):
            old_fm = yaml.safe_load(existing_md[3:existing_md.find("\n---", 3)]) or {}
        rels, seen = [], set()
        for r in list(old_fm.get("relations") or []) + list(data.get("relations") or []):
            if not isinstance(r, dict):
                continue
            tgt = PAGE_LINK.sub(lambda m: m.group(1), str(r.get("target") or "")).strip()
            typ = str(r.get("type") or "").strip()
            ev = []
            for e in r.get("evidence") or []:
                m = BARE_REF.search(str(e))
                if m and f"{m.group(1)}#^{m.group(2)}" in allowed:
                    ev.append(f"[[{m.group(1)}#^{m.group(2)}]]")
            if tgt not in self.kb.pages or tgt == pid or typ not in REL_TYPES or not ev:
                warnings.append(f"舍弃一条无法核对的关系：{tgt or '?'}（{typ or '?'}）")
                continue
            key = (tgt, typ, str(r.get("label") or ""))
            if key in seen:
                continue
            seen.add(key)
            rels.append({"target": f"[[{tgt}]]", "type": typ, "label": str(r.get("label") or "")[:60], "date": r.get("date") or "", "evidence": ev})

        fm = {"id": pid, "type": ptype, "title": existing and old_fm.get("title") or str(data.get("title") or title).strip() or title}
        al = [str(a).strip() for a in list(old_fm.get("aliases") or []) + aliases + list(data.get("aliases") or []) if str(a).strip()]
        fm["aliases"] = [a for a in dict.fromkeys(al) if a not in (fm["title"], pid)]
        summary = str(data.get("summary") or old_fm.get("summary") or "").strip()
        fm["summary"] = summary[:80]
        for k in FM_KEYS:
            v = data.get(k, old_fm.get(k))
            if v in (None, "", []):
                continue
            if k in ("participants", "books", "places"):
                v = [f"[[{x}]]" for x in (PAGE_LINK.sub(lambda m: m.group(1), str(i)).strip() for i in (v if isinstance(v, list) else [v])) if x in self.kb.pages]
            if k == "relation_types":
                v = [x for x in v if x in REL_TYPES]
            if v not in (None, "", []):
                fm[k] = v
        if rels:
            fm["relations"] = rels
        used = sorted({m.group(1) for m in REF.finditer(body)} | {BARE_REF.search(e).group(1) for r in rels for e in r["evidence"]}
                      | set(old_fm.get("sources") or []))
        fm["sources"] = used
        fm["status"] = "draft"
        fm["added_by"] = "后台补充"
        fm["updated"] = today()
        if not used:
            warnings.append("词条没有引用任何资料，写入前请补充出处")
        return {"fm": fm, "body": body}, warnings

    @staticmethod
    def compose(page: dict) -> str:
        fm = page["fm"]
        head = yaml.safe_dump(fm, allow_unicode=True, sort_keys=False, width=1000, default_flow_style=None).strip()
        return f"---\n{head}\n---\n\n# {fm['title']}\n\n{page['body'].strip()}\n"

    # ---- commit -------------------------------------------------------------------
    def commit(self, markdown: str, upload: dict | None, overwrite: bool) -> dict:
        wiki = pipeline_wiki()
        with self.lock:
            fm, _body = wiki.split_frontmatter(markdown)
            pid, ptype = sanitize_id(str(fm.get("id") or "")), fm.get("type")
            if not pid or ptype not in TYPE_DIRS or not fm.get("title"):
                raise ValueError("frontmatter 缺少 id / type / title，或类型不受支持")
            target = self.page_file(pid)
            if target and not overwrite:
                raise FileExistsError(f"知识库已有页面“{pid}”，如需覆盖请选择“合并更新”后再写入")
            docs = []
            if UPLOAD in markdown:
                if not upload or not (upload.get("text") or "").strip():
                    raise ValueError("词条引用了上传资料，但没有收到资料原文")
                doc_id = self.save_upload(upload)
                markdown = markdown.replace(UPLOAD, doc_id)
                docs.append(doc_id)
            path = target or (config.WIKI / TYPE_DIRS[ptype] / f"{pid}.md")
            path.parent.mkdir(parents=True, exist_ok=True)
            stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
            backup = ""
            if target:
                hist = self.dir / "history"
                hist.mkdir(parents=True, exist_ok=True)
                (hist / f"{pid}-{stamp}.md").write_text(target.read_text(encoding="utf-8"), encoding="utf-8")
                backup = f"history/{pid}-{stamp}.md"
            path.write_text(markdown, encoding="utf-8")
            keep = self.dir / "pages"
            keep.mkdir(parents=True, exist_ok=True)
            (keep / f"{pid}.md").write_text(markdown, encoding="utf-8")
            with open(config.WIKI / "log.md", "a", encoding="utf-8") as fh:
                fh.write(f"\n## [{today()}] admin | {'更新' if target else '新增'} {pid}\n\n- 后台 wiki 补充页写入 `{path.relative_to(config.KB_ROOT).as_posix()}`"
                         + (f"；上传资料 {', '.join(docs)}" if docs else "") + "\n")
            prev = next((e for e in self.manifest() if e["id"] == pid), None)
            items = [e for e in self.manifest() if e["id"] != pid]
            items.append({"id": pid, "title": fm["title"], "type": ptype, "path": path.relative_to(config.KB_ROOT).as_posix(),
                          "time": dt.datetime.now().isoformat(timespec="seconds"),
                          "action": prev["action"] if prev else ("更新" if target else "新增"),
                          # withdrawing goes back to the page as it was before the first admin edit
                          "backup": prev.get("backup", "") if prev else backup,
                          "docs": docs + (prev.get("docs", []) if prev else [])})
            self._save_manifest(items)
            stats = self.refresh([pid])
        return {"id": pid, "url": f"/wiki/{pid}", "path": path.relative_to(config.KB_ROOT).as_posix(), "docs": docs, **stats}

    def remove(self, pid: str) -> dict:
        """Withdraw an entry made here: restore the page as it was before (or delete a new page) and drop its uploads."""
        with self.lock:
            entry = next((e for e in self.manifest() if e["id"] == pid), None)
            if not entry:
                raise ValueError("只能撤回通过后台补充的词条")
            path = config.KB_ROOT / entry["path"]
            backup = self.dir / entry["backup"] if entry.get("backup") else None
            if backup and backup.exists():
                path.write_text(backup.read_text(encoding="utf-8"), encoding="utf-8")
            elif path.exists():
                hist = self.dir / "history"
                hist.mkdir(parents=True, exist_ok=True)
                (hist / f"{pid}-withdrawn-{dt.datetime.now():%Y%m%d-%H%M%S}.md").write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
                path.unlink()
            for doc_id in entry.get("docs", []):
                self.drop_upload(doc_id)
            (self.dir / "pages" / f"{pid}.md").unlink(missing_ok=True)
            self._save_manifest([e for e in self.manifest() if e["id"] != pid])
            with open(config.WIKI / "log.md", "a", encoding="utf-8") as fh:
                fh.write(f"\n## [{today()}] admin | 撤回 {pid}\n\n- {'恢复到后台修改前的版本' if backup else '删除后台新增的页面'}"
                         + (f"；移除上传资料 {', '.join(entry['docs'])}" if entry.get("docs") else "") + "\n")
            if not (backup and backup.exists()):
                self.rag.dense.remove(lambda r: not (r["kind"] == "wiki" and r["id"] == pid))
            stats = self.refresh([pid] if backup else [])
        return {"id": pid, "restored": bool(backup), **stats}

    def drop_upload(self, doc_id: str) -> None:
        if not re.fullmatch(r"sup-\d{4}", doc_id):
            return
        (config.EXPORT / "docs" / f"{doc_id}.json").unlink(missing_ok=True)
        cat_path = config.EXPORT / "documents.json"
        cat_path.write_text(json.dumps([d for d in json.loads(cat_path.read_text(encoding="utf-8")) if d["doc_id"] != doc_id],
                                       ensure_ascii=False, indent=1), encoding="utf-8")
        for p in (config.KB_ROOT / "corpus" / f"{doc_id}.md", config.KB_ROOT / "uploads" / f"{doc_id}.txt", self.dir / "uploads" / f"{doc_id}.json"):
            p.unlink(missing_ok=True)
        con = sqlite3.connect(config.INDEX / "kb.sqlite")
        try:
            for old in con.execute("SELECT rowid, fold, heading FROM chunks WHERE doc_id=?", (doc_id,)).fetchall():
                con.execute("INSERT INTO chunks_fts(chunks_fts, rowid, fold, heading) VALUES('delete', ?, ?, ?)", old)
            for table in ("chunks", "blocks", "documents"):
                con.execute(f"DELETE FROM {table} WHERE doc_id=?", (doc_id,))
            con.commit()
        finally:
            con.close()
        self.rag.dense.remove(lambda r: not (r["kind"] == "chunk" and r["id"].startswith(doc_id + "#")))
        self.kb.reload()

    def _next_sup(self) -> str:
        nums = [int(d[4:]) for d in self.kb.documents if d.startswith("sup-") and d[4:].isdigit()]
        nums += [int(p.stem[4:]) for p in (self.dir / "uploads").glob("sup-*.json") if p.stem[4:].isdigit()]
        return f"sup-{max(nums, default=0) + 1:04d}"

    def save_upload(self, upload: dict, doc_id: str | None = None) -> str:
        """Store pasted / uploaded material as citable source document sup-NNNN (export JSON, sqlite, vectors)."""
        doc_id = doc_id or self._next_sup()
        texts = split_blocks(upload["text"])
        blocks = [{"bid": f"b{i:04d}", "type": "paragraph", "text": t, "page": None} for i, t in enumerate(texts, 1)]
        title = (upload.get("title") or upload.get("name") or "后台补充资料").strip()
        authors = [upload["author"].strip()] if (upload.get("author") or "").strip() else []
        entry = {"doc_id": doc_id, "title": title, "subtitle": "", "authors": authors, "origin": "后台补充", "kind": "upload",
                 "raw_path": f"uploads/{doc_id}.txt", "corpus_path": f"corpus/{doc_id}.md", "journal": "", "year": str(upload.get("year") or ""),
                 "issue": "", "page_range": "", "citation": (upload.get("citation") or "").strip() or f"{'、'.join(authors) + '：' if authors else ''}{title}（后台补充资料）",
                 "abstract": "", "keywords": [], "char_count": sum(len(t) for t in texts), "canonical": True, "dedup_group": "",
                 "alternates": [], "quality": {"source": "admin_upload", "file": upload.get("name", "")}, "pages": 0}
        doc = {**entry, "meta": {}, "blocks": blocks}
        (config.EXPORT / "docs").mkdir(parents=True, exist_ok=True)
        (config.EXPORT / "docs" / f"{doc_id}.json").write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
        cat_path = config.EXPORT / "documents.json"
        cat = [d for d in json.loads(cat_path.read_text(encoding="utf-8")) if d["doc_id"] != doc_id] + [entry]
        cat_path.write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding="utf-8")
        for folder, name, content in (("uploads", f"{doc_id}.txt", upload["text"]),
                                      ("corpus", f"{doc_id}.md", f"---\ndoc_id: {doc_id}\ntitle: {json.dumps(title, ensure_ascii=False)}\norigin: 后台补充\n---\n\n"
                                       + "\n\n".join(f"{b['text']} ^{b['bid']}" for b in blocks) + "\n")):
            d = config.KB_ROOT / folder
            d.mkdir(parents=True, exist_ok=True)
            (d / name).write_text(content, encoding="utf-8")
        keep = self.dir / "uploads"
        keep.mkdir(parents=True, exist_ok=True)
        (keep / f"{doc_id}.json").write_text(json.dumps({**upload, "doc_id": doc_id}, ensure_ascii=False), encoding="utf-8")

        chunks, cur, n = [], [], 0
        for b in blocks:
            if cur and sum(len(x["text"]) for x in cur) + len(b["text"]) > 650:
                chunks.append(cur)
                cur = []
            cur.append(b)
        if cur:
            chunks.append(cur)
        con = sqlite3.connect(config.INDEX / "kb.sqlite")
        try:
            con.execute("DELETE FROM documents WHERE doc_id=?", (doc_id,))
            con.execute("DELETE FROM blocks WHERE doc_id=?", (doc_id,))
            con.execute("INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (doc_id, title, "", json.dumps(authors, ensure_ascii=False), "后台补充", "upload", entry["raw_path"], entry["corpus_path"],
                         "", entry["year"], "", "", entry["citation"], "", "[]", entry["char_count"], 1, "", "[]",
                         json.dumps(entry["quality"], ensure_ascii=False), "{}"))
            con.executemany("INSERT INTO blocks VALUES (?,?,?,?,?,?,?)", [(doc_id, b["bid"], i, "paragraph", b["text"], None, None) for i, b in enumerate(blocks, 1)])
            for old in con.execute("SELECT rowid, fold, heading FROM chunks WHERE doc_id=?", (doc_id,)).fetchall():
                con.execute("INSERT INTO chunks_fts(chunks_fts, rowid, fold, heading) VALUES('delete', ?, ?, ?)", old)
            con.execute("DELETE FROM chunks WHERE doc_id=?", (doc_id,))
            vec_items = []
            for i, grp in enumerate(chunks, 1):
                text = "\n".join(b["text"] for b in grp)
                cid = f"{doc_id}#c{i:03d}"
                cur_ = con.execute("INSERT INTO chunks (chunk_id, doc_id, seq, kind, heading, block_ids, page_start, page_end, text, chars, fold)"
                                   " VALUES (?,?,?,?,?,?,?,?,?,?,?)", (cid, doc_id, i, "body", "", json.dumps([b["bid"] for b in grp]), None, None,
                                                                      text, len(text), fold(title + "\n" + text)))
                con.execute("INSERT INTO chunks_fts(rowid, fold, heading) VALUES (?,?,?)", (cur_.lastrowid, fold(title + "\n" + text), ""))
                vec_items.append(("chunk", cid, f"{title}\n{text}"[:1000]))
            con.commit()
        finally:
            con.close()
        self.kb.reload()
        self.rag.dense.upsert(vec_items)
        return doc_id

    # ---- index refresh ---------------------------------------------------------------
    def refresh(self, changed: list[str]) -> dict:
        """Rebuild the wiki side of kb.sqlite, the mention counts and the JSON exports from wiki/*.md."""
        t0 = time.perf_counter()
        wiki = pipeline_wiki()
        pages = wiki.load_pages()
        con = sqlite3.connect(config.INDEX / "kb.sqlite")
        try:
            chunks = [{"doc_id": d, "chunk_id": c, "text": f.split("\n", 1)[-1]} for d, c, f in con.execute("SELECT doc_id, chunk_id, fold FROM chunks")]
            mentions = wiki.count_mentions(pages, chunks, lambda s: fold(s) if len(s) < 64 else s)
            con.execute("DELETE FROM wiki_pages")
            con.execute("DELETE FROM wiki_links")
            con.execute("DELETE FROM mentions")
            for pg in pages:
                con.execute("INSERT INTO wiki_pages (page_id, path, type, title, aliases, summary, frontmatter, body, fold) VALUES (?,?,?,?,?,?,?,?,?)",
                            (pg["id"], pg["path"], pg["type"], pg["title"], json.dumps(pg["aliases"], ensure_ascii=False), pg["summary"],
                             json.dumps(pg["fm"], ensure_ascii=False, default=str), pg["body"], fold(pg["title"] + "\n" + pg["body"])))
                con.executemany("INSERT INTO wiki_links VALUES (?,?,?,?)", [(pg["id"], l["target"], l["anchor"], l["label"]) for l in pg["links"]])
            con.execute("INSERT INTO wiki_fts(wiki_fts) VALUES('rebuild')")
            con.executemany("INSERT INTO mentions VALUES (?,?,?,?,?)", mentions)
            con.commit()
        finally:
            con.close()
        wiki.export(pages, mentions, config.EXPORT)
        self.kb.reload()
        by_id = {p["id"]: p for p in pages}
        vec = [("wiki", pid, f"{by_id[pid]['title']}\n{by_id[pid]['summary']}\n{by_id[pid]['body']}"[:1000]) for pid in changed if pid in by_id]
        embedded = self.rag.dense.upsert(vec) if vec else 0
        return {"pages": len(pages), "mentions": len(mentions), "embedded": embedded, "seconds": round(time.perf_counter() - t0, 1)}

    def reconcile(self) -> None:
        """After a redeploy, put back the uploads and pages committed here that the new package does not contain,
        then embed wiki pages that have no vector yet (pages written after the last full embedding run)."""
        notes = []
        try:
            items = self.manifest() if (config.PIPELINE / "kb" / "wiki.py").exists() else []
            changed = []
            with self.lock:
                for e in items:
                    for doc_id in e.get("docs", []):
                        saved = self.dir / "uploads" / f"{doc_id}.json"
                        if doc_id not in self.kb.documents and saved.exists():
                            self.save_upload(json.loads(saved.read_text(encoding="utf-8")), doc_id)
                    kept = self.dir / "pages" / f"{e['id']}.md"
                    if e["id"] not in self.kb.pages and kept.exists():
                        path = config.KB_ROOT / e["path"]
                        path.parent.mkdir(parents=True, exist_ok=True)
                        path.write_text(kept.read_text(encoding="utf-8"), encoding="utf-8")
                        changed.append(e["id"])
                if changed:
                    self.refresh(changed)
                    notes.append(f"已恢复 {len(changed)} 个后台补充词条")
            for _ in range(120):  # vectors load in a background thread
                if self.rag.dense.ready or self.rag.dense.error:
                    break
                time.sleep(1)
            missing = self.rag.dense.missing_wiki([pid for pid, p in self.kb.pages.items() if p["type"] != "meta"])
            if missing:
                self.rag.dense.upsert([("wiki", pid, f"{self.kb.pages[pid]['title']}\n{self.kb.pages[pid]['summary']}\n{self.kb.pages[pid]['body']}"[:1000])
                                       for pid in missing])
                notes.append(f"补齐 {len(missing)} 个知识页的向量")
            if self.rag.dense.ready:
                have = {r["id"] for r in self.rag.dense.rows if r["kind"] == "chunk" and r["id"].startswith("sup-")}
                con = connect()
                todo = [("chunk", r["chunk_id"], f"{self.kb.documents.get(r['doc_id'], {}).get('title', '')}\n{r['text']}"[:1000])
                        for r in con.execute("SELECT chunk_id, doc_id, text FROM chunks WHERE doc_id LIKE 'sup-%'") if r["chunk_id"] not in have]
                con.close()
                if todo:
                    self.rag.dense.upsert(todo)
        except Exception as e:  # noqa: BLE001 - never block startup
            notes.append(f"启动整理失败：{e}")
        self.reconcile_note = "；".join(notes)


def decode_upload(name: str, b64: str) -> str:
    return extract_text(name, base64.b64decode(b64))
