import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SearchGlyph } from "../components/SearchGlyph";
import { PageHeader, Reveal } from "../components/ui";
import { api, routeFor, TYPE_LABEL } from "../lib/api";
import { useAgent, usePageAgent, useSource } from "../lib/store";

type Res = {
  wiki: { page_id: string; type: string; title: string; summary: string }[];
  chunks: { chunk_id: string; doc_id: string; heading: string; block_ids: string[]; page_start: number | null; text: string; title: string; authors: string[]; year: string }[];
};
const HOT = ["双鉴楼", "扬子法言", "乐府诗集", "永乐大典", "道藏", "赵万里", "海源阁", "通典"];

function highlight(text: string, q: string) {
  const terms = q.split(/\s+/).filter(Boolean);
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return text.split(re).map((part, i) => (terms.includes(part) ? <mark key={i}>{part}</mark> : part));
}

export function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const [input, setInput] = useState(q);
  const [res, setRes] = useState<Res | null>(null);
  const [loading, setLoading] = useState(false);
  const src = useSource();
  const { openChat } = useAgent();
  usePageAgent({ tip: "检索支持繁简通用：搜“藏园”也能找到“藏園”。多个词用空格分开。", questions: [] });
  useEffect(() => {
    setInput(q);
    if (!q) { setRes(null); return; }
    setLoading(true);
    api<Res>(`/search?q=${encodeURIComponent(q)}&limit=24`).then(setRes).finally(() => setLoading(false));
  }, [q]);
  return (
    <div className="page search">
      <PageHeader eyebrow="全站检索" title="检书" lead={<p>同时检索知识库页面与 {""}整理入库的原文段落。</p>} />
      <section className="narrow">
        <form className="search-box" onSubmit={(e) => { e.preventDefault(); setParams(input.trim() ? { q: input.trim() } : {}); }}>
          <label className="search-field">
            <SearchGlyph size={20} />
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="人名、书名、年份……" autoFocus aria-label="检索词" />
          </label>
          <button className="btn solid">检索</button>
        </form>
        <div className="tl-filters left">{HOT.map((h) => <button key={h} className="chip" onClick={() => setParams({ q: h })}>{h}</button>)}</div>
        {loading && <p className="muted">检索中…</p>}
        {res && (
          <>
            {q && <button className="btn small zhu ask-xf" onClick={() => openChat(`关于“${q}”，资料里有哪些记载？`)}>让小傅基于检索结果回答“{q}”</button>}
            {!!res.wiki.length && <h3 className="search-h">知识页 · {res.wiki.length}</h3>}
            <div className="search-wiki">
              {res.wiki.map((w, i) => (
                <Reveal key={w.page_id} delay={i * 0.03}>
                  <Link to={routeFor(w.page_id, w.type)} className="card hover search-card">
                    <span className="seal qing">{TYPE_LABEL[w.type] || w.type}</span>
                    <b>{highlight(w.title, q)}</b>
                    <p className="muted small">{highlight(w.summary || "", q)}</p>
                  </Link>
                </Reveal>
              ))}
            </div>
            <h3 className="search-h">原文段落 · {res.chunks.length}</h3>
            {!res.chunks.length && <p className="muted">没有找到原文段落。</p>}
            {res.chunks.map((c, i) => (
              <motion.div key={c.chunk_id} className="chunk-hit" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                <div className="chunk-meta">
                  <button className="link-zhu" onClick={() => src.open(c.doc_id, c.block_ids[0])}>{c.title}</button>
                  <span className="muted small">{c.authors.join("、")} {c.year} {c.page_start ? `· 第 ${c.page_start} 页` : ""} {c.heading ? `· ${c.heading}` : ""}</span>
                </div>
                <p>{highlight(c.text.length > 260 ? c.text.slice(0, 260) + "…" : c.text, q)}</p>
              </motion.div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
