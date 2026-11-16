import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ErrorNote, Loading, PageHeader } from "../components/ui";
import { api, kbAsset, type ImageItem } from "../lib/api";
import { usePageAgent } from "../lib/store";

const KINDS: Record<string, string> = { seal: "印鉴", calligraphy: "书法", letter: "信札", colophon: "题跋", book_page: "书影", portrait: "肖像", manuscript: "手迹", figure: "批校图", painting: "绘画", other: "其他" };

export function Gallery() {
  const [imgs, setImgs] = useState<ImageItem[]>([]);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [cur, setCur] = useState<number | null>(null);
  useEffect(() => { api<ImageItem[]>("/images").then(setImgs).catch((e) => setErr(e.message)); }, []);
  usePageAgent({ tip: "这些图像来自资料库。印文、朱白文从题名整理而来；上线展示前仍需确认来源与使用条件。", questions: ["傅增湘常用的藏书印有哪些？"] });
  const shown = imgs.filter((i) => !kind || i.kind === kind);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (cur === null) return;
      if (e.key === "Escape") setCur(null);
      if (e.key === "ArrowRight") setCur((c) => (c! + 1) % shown.length);
      if (e.key === "ArrowLeft") setCur((c) => (c! - 1 + shown.length) % shown.length);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [cur, shown.length]);
  const im = cur !== null ? shown[cur] : null;
  return (
    <div className="page gallery">
      <PageHeader eyebrow="藏园图像" title="印与墨" lead={<p>印鉴、书法、信札、题跋、书影与肖像。点开放大，左右键翻看。</p>} />
      <section className="container">
        <div className="tl-filters left">
          <button className={`chip ${!kind ? "active" : ""}`} onClick={() => setKind(null)}>全部 {imgs.length}</button>
          {Object.entries(KINDS).map(([k, v]) => {
            const n = imgs.filter((i) => i.kind === k).length;
            return n ? <button key={k} className={`chip ${kind === k ? "active" : ""}`} onClick={() => setKind(k)}>{v} {n}</button> : null;
          })}
        </div>
        {err && <ErrorNote msg={err} />}
        {!imgs.length && !err && <Loading h={400} />}
        <motion.div className="masonry" layout>
          <AnimatePresence>
            {shown.map((m, i) => (
              <motion.button key={m.id} layout className={`m-item k-${m.kind}`} onClick={() => setCur(i)}
                initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: (i % 12) * 0.03 }}
                whileHover={{ y: -4 }}>
                <img src={kbAsset(m.thumb)} alt={m.title} loading="lazy" />
                <span className="m-cap"><span className="seal">{KINDS[m.kind] || m.kind}</span>{m.seal_text || m.title}</span>
              </motion.button>
            ))}
          </AnimatePresence>
        </motion.div>
      </section>
      <AnimatePresence>
        {im && (
          <motion.div className="lightbox" data-scroll-trap initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCur(null)}>
            <motion.figure key={im.id} initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <img src={kbAsset(im.file)} alt={im.title} />
              <figcaption>
                <span className="seal solid">{KINDS[im.kind] || im.kind}</span>
                <h3>{im.title}</h3>
                {im.seal_text && <p>印文：{im.seal_text}{im.seal_color ? ` · ${im.seal_color}` : ""}{im.seal_style ? ` · ${im.seal_style}` : ""}</p>}
                <p className="muted small">{im.origin} · {im.width}×{im.height}px · 原件：{im.raw_path}</p>
                <div className="row">
                  <button className="btn small" onClick={() => setCur((c) => (c! - 1 + shown.length) % shown.length)}>← 上一幅</button>
                  <button className="btn small" onClick={() => setCur((c) => (c! + 1) % shown.length)}>下一幅 →</button>
                  <button className="btn small ghost" onClick={() => setCur(null)}>关闭</button>
                </div>
              </figcaption>
            </motion.figure>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
