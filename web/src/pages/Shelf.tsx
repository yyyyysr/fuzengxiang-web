import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { ErrorNote, Loading, PageHeader, Reveal } from "../components/ui";
import { api, stripLinks, type Book, type WikiPage } from "../lib/api";
import { useAgent, usePageAgent } from "../lib/store";

const COVERS = ["#2e4855", "#5b3a2e", "#3b4d3f", "#4a3f5c", "#6b4a2b", "#2f3e4e", "#5d2f2b"];
const SHELVES: { key: string; name: string; note: string }[] = [
  { key: "经", name: "经部", note: "儒家经典及其注疏" },
  { key: "史", name: "史部", note: "正史、编年、政书" },
  { key: "子", name: "子部", note: "诸子、类书与杂著" },
  { key: "集", name: "集部", note: "诗文别集与总集" },
  { key: "丛", name: "影印与编纂", note: "傅增湘参与的影印出版与著述项目" },
];

export function Shelf() {
  const [books, setBooks] = useState<Book[]>([]);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<Book | null>(null);
  useEffect(() => { api<Book[]>("/books").then(setBooks).catch((e) => setErr(e.message)); }, []);
  usePageAgent({ tip: "书架按经、史、子、集四部上架，最下一层是傅增湘参与的影印项目。点一部书，看他与这部书的具体关系和出处。", questions: ["“经眼”和“旧藏”有什么区别？", "傅增湘为什么要举债买宋本《周易正义》？"] });
  const rows = useMemo(() => SHELVES.map((s) => ({ ...s, books: books.filter((b) => (b.type === "work" ? "丛" : b.category || "子") === s.key) })).filter((s) => s.books.length), [books]);

  return (
    <div className="page shelf">
      <PageHeader eyebrow="双鉴书架" title="这本书与傅增湘究竟是什么关系"
        lead={<p>书架上的每一部都落到具体版本：谁藏过、傅增湘怎样得到它、校过什么、后来去了哪里。按传统的经、史、子、集四部上架，最下一层是他参与的影印项目。</p>} />
      <section className="container">
        {err && <ErrorNote msg={err} />}
        {!books.length && !err && <Loading h={360} />}
        <div className="shelves">
          {rows.map((row, ri) => (
            <Reveal key={row.key} className="shelf-row" delay={ri * 0.06}>
              <div className="shelf-tag">
                <span className="brush">{row.key}</span>
                <b>{row.name}</b>
                <small>{row.note}</small>
              </div>
              <div className="bookcase">
                {row.books.map((b, i) => (
                  <motion.button key={b.id} className="volume" onClick={() => setOpen(b)}
                    initial={{ opacity: 0, y: 40, rotate: -2 }} whileInView={{ opacity: 1, y: 0, rotate: 0 }} viewport={{ once: true }}
                    transition={{ delay: i * 0.05, type: "spring", stiffness: 200, damping: 22 }}
                    whileHover={{ y: -14, rotate: -1.5 }}
                    style={{ ["--cover" as any]: COVERS[(ri * 3 + i) % COVERS.length] }}>
                    <span className="volume-thread" />
                    <span className="volume-label"><span>{b.title.replace(/（.*?）/g, "")}</span></span>
                    <span className="volume-type">{b.type === "work" ? "项目" : "版本"}</span>
                    <span className="volume-rels">{b.relation_types.slice(0, 3).join(" · ")}</span>
                  </motion.button>
                ))}
                <div className="shelf-board" />
              </div>
            </Reveal>
          ))}
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
    <motion.div className="modal-mask" data-scroll-trap initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
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
            <p className="muted">{stripLinks(book.summary)}</p>
          </div>
          <div>
            <span className="eyebrow">它与谁有关</span>
            <ul className="rel-list">
              {book.relations.map((r, i) => (
                <Reveal key={i} delay={i * 0.06}>
                  <li>
                    <span className="seal solid">{r.type}</span>
                    <div>
                      <b>{stripLinks(r.target)}</b>{r.date ? <span className="muted small"> · {String(r.date)}</span> : null}
                      <p>{r.label}</p>
                      {!!r.evidence?.length && <Markdown className="rel-src" text={"出处：" + r.evidence.join("；")} titles={page?.link_titles} />}
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
