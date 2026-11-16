import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Doc } from "../lib/api";
import { useSource } from "../lib/store";

/** Side drawer showing the cited paragraph in context — the "查看出处" of the whole site. */
export function SourceDrawer() {
  const { current, close } = useSource();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [err, setErr] = useState("");
  const focus = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!current) return;
    setDoc(null);
    setErr("");
    api<Doc>(`/docs/${current.doc}`).then(setDoc).catch((e) => setErr(e.message));
  }, [current?.doc]);

  useEffect(() => {
    const t = window.setTimeout(() => focus.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 350);
    return () => window.clearTimeout(t);
  }, [doc, current?.bid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const idx = doc && current?.bid ? doc.blocks.findIndex((b) => b.bid === current.bid) : -1;
  const shown = doc ? (idx >= 0 ? doc.blocks.slice(Math.max(0, idx - 2), idx + 3) : doc.blocks.slice(0, 6)) : [];
  const page = idx >= 0 ? doc!.blocks[idx].page : null;

  return (
    <AnimatePresence>
      {current && (
        <>
          <motion.div className="drawer-mask" data-scroll-trap initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.aside
            className="drawer"
            data-scroll-trap
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 260 }}
            role="dialog" aria-label="出处原文"
          >
            <header className="drawer-head">
              <span className="seal solid">出处</span>
              <button className="drawer-close" onClick={close} aria-label="关闭">×</button>
            </header>
            {err && <p className="muted">{err}</p>}
            {!doc && !err && <div className="skeleton" style={{ height: 240 }} />}
            {doc && (
              <div className="drawer-body">
                <h3 className="drawer-title">{doc.title}</h3>
                <p className="muted small">
                  {doc.authors?.join("、")} {doc.citation && <>· {doc.citation}</>}
                  {page ? ` · PDF 第 ${page} 页` : ""}
                </p>
                {doc.quality?.ocr_fallback && <p className="ocr-note">本篇为 OCR 识别文本，引用前请对照原页。</p>}
                <div className="drawer-text">
                  {idx < 0 && current.bid && <p className="muted small">未找到段落 {current.bid}，显示篇首。</p>}
                  {shown.map((b) => (
                    <p key={b.bid} ref={b.bid === current.bid ? focus : undefined} className={`drawer-block ${b.bid === current.bid ? "hit" : ""} t-${b.type}`}>
                      {b.text.replace(/<[^>]+>/g, "")}
                    </p>
                  ))}
                </div>
                <div className="drawer-actions">
                  <Link className="btn small zhu" to={`/doc/${doc.doc_id}${current.bid ? `#${current.bid}` : ""}`} onClick={close}>阅读全文</Link>
                  <span className="muted small">原件：{doc.raw_path}</span>
                </div>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
