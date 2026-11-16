import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { ErrorNote, Loading, PageHeader, Reveal } from "../components/ui";
import { api, stripLinks, type Book, type WikiPage } from "../lib/api";
import { useAgent, usePageAgent } from "../lib/store";

const REL_ORDER = ["旧藏", "购藏", "经眼", "校勘", "题跋", "借阅", "影印", "捐赠", "出让", "递藏"];
const COVERS = ["#2e4855", "#5b3a2e", "#3b4d3f", "#4a3f5c", "#6b4a2b", "#2f3e4e", "#5d2f2b"];

export function Shelf() {
  const [books, setBooks] = useState<Book[]>([]);
  const [err, setErr] = useState("");
  const [rel, setRel] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | "book" | "work">("all");
  const [open, setOpen] = useState<Book | null>(null);
  useEffect(() => { api<Book[]>("/books").then(setBooks).catch((e) => setErr(e.message)); }, []);
  usePageAgent({ tip: "书架上的每一部书都落到具体版本。注意区分“旧藏”和“经眼”——见过不等于收藏过。", questions: ["“经眼”和“旧藏”有什么区别？", "傅增湘为什么要举债买宋本《周易正义》？"] });

  const relCounts = useMemo(() => Object.fromEntries(REL_ORDER.map((r) => [r, books.filter((b) => b.relation_types.includes(r)).length])), [books]);
  const shown = books.filter((b) => (kind === "all" || b.type === kind) && (!rel || b.relation_types.includes(rel)));

  return (
    <div className="page shelf">
      <PageHeader eyebrow="双鉴书架" title="这本书与傅增湘究竟是什么关系" lead={<p>旧藏、经眼、校勘、题跋、借阅、影印、捐赠……同一部书可有多种关系，每一种都绑定日期与出处。</p>} />
      <section className="container">
        <div className="shelf-filters">
          <div className="seg">
            {(["all", "book", "work"] as const).map((k) => (
              <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{{ all: "全部", book: "具体版本", work: "著述 · 影印项目" }[k]}</button>
            ))}
          </div>
          <div className="tl-filters left">
            <button className={`chip ${!rel ? "active" : ""}`} onClick={() => setRel(null)}>全部关系</button>
            {REL_ORDER.filter((r) => relCounts[r]).map((r) => <button key={r} className={`chip ${rel === r ? "active" : ""}`} onClick={() => setRel(r)}>{r} {relCounts[r]}</button>)}
          </div>
        </div>
        {err && <ErrorNote msg={err} />}
        {!books.length && !err && <Loading h={360} />}
        <div className="bookcase">
          <AnimatePresence mode="popLayout">
            {shown.map((b, i) => (
              <motion.button key={b.id} layout className="volume" onClick={() => setOpen(b)}
                initial={{ opacity: 0, y: 40, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.04, type: "spring", stiffness: 200, damping: 22 }}
                whileHover={{ y: -14, rotate: -1.5 }}
                style={{ ["--cover" as any]: COVERS[i % COVERS.length] }}>
                <span className="volume-thread" />
                <span className="volume-label"><span>{b.title.replace(/（.*?）/g, "")}</span></span>
                <span className="volume-type">{b.type === "work" ? "项目" : "版本"}</span>
                <span className="volume-rels">{b.relation_types.slice(0, 3).join(" · ")}</span>
              </motion.button>
            ))}
          </AnimatePresence>
          <div className="shelf-board" />
        </div>
      </section>
      <AnimatePresence>{open && <BookModal book={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </div>
  );
}

function BookModal({ book, onClose }: { book: Book; onClose: () => void }) {
  const [page, setPage] = useState<WikiPage | null>(null);
  const { openChat, express } = useAgent();
  useEffect(() => { api<WikiPage>(`/wiki/${encodeURIComponent(book.id)}`).then(setPage).catch(() => {}); express("happy", 2500); }, [book.id, express]);
  const stories = page?.backlink_cards.filter((c) => c.type === "story") || [];
  return (
    <motion.div className="modal-mask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="book-modal" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }} onClick={(e) => e.stopPropagation()}>
        <button className="drawer-close" onClick={onClose} aria-label="关闭">×</button>
        <div className="book-modal-grid">
          <div className="book-id">
            <span className="eyebrow">书的身份</span>
            <h2>{book.title}</h2>
            {book.work && <p><b>作品</b>　{book.work}</p>}
            {book.edition && <p><b>版本</b>　{book.edition}</p>}
            {book.current_holder && <p><b>现藏</b>　{book.current_holder}</p>}
            <p className="muted">{book.summary}</p>
          </div>
          <div>
            <span className="eyebrow">傅增湘做了什么</span>
            <ul className="rel-list">
              {book.relations.map((r, i) => (
                <Reveal key={i} delay={i * 0.06}>
                  <li>
                    <span className="seal solid">{r.type}</span>
                    <div>
                      <b>{stripLinks(r.target)}</b>{r.date ? <span className="muted small"> · {String(r.date)}</span> : null}
                      <p>{r.label}</p>
                      {!!r.evidence?.length && <Markdown text={"证据：" + r.evidence.join("；")} />}
                    </div>
                  </li>
                </Reveal>
              ))}
              {!book.relations.length && <li className="muted">关系待补。</li>}
            </ul>
          </div>
        </div>
        {page && (
          <div className="book-body">
            <Markdown text={page.body.replace(/^# .*\n/, "")} titles={page.link_titles} />
          </div>
        )}
        <div className="row" style={{ marginTop: 16 }}>
          {stories.map((s) => <Link key={s.id} className="btn small solid" to={`/stories/${encodeURIComponent(s.id)}`}>相关故事：{s.title.slice(0, 14)}</Link>)}
          <Link className="btn small" to={`/wiki/${encodeURIComponent(book.id)}`}>完整书籍卡</Link>
          <button className="btn small zhu" onClick={() => openChat(`${book.title}与傅增湘是什么关系？`)}>问小傅</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
