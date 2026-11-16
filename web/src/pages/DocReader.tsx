import { motion, useScroll, useSpring } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ErrorNote, Loading } from "../components/ui";
import { api, kbAsset, type Doc } from "../lib/api";
import { useAgent, usePageAgent } from "../lib/store";

/** Clean full-text reader for a source document; #b0045 highlights a paragraph. */
export function DocReader() {
  const { id = "" } = useParams();
  const loc = useLocation();
  const [d, setD] = useState<Doc | null>(null);
  const [err, setErr] = useState("");
  const { scrollYProgress } = useScroll();
  const bar = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const { openChat } = useAgent();
  const target = loc.hash.slice(1);
  useEffect(() => { setD(null); api<Doc>(`/docs/${id}`).then(setD).catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => {
    if (!d || !target) return;
    const t = window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ block: "center", behavior: "smooth" }), 500);
    return () => window.clearTimeout(t);
  }, [d, target]);
  usePageAgent(d ? { id: null, title: d.title, tip: "这是整理后的原文全文。朱色高亮的是被引用的段落。", questions: [`《${d.title}》主要讲了什么？`] } : {}, [d?.doc_id]);
  if (err) return <div className="page"><ErrorNote msg={err} /></div>;
  if (!d) return <div className="page narrow"><Loading h={600} /></div>;
  let page: number | null = null;
  return (
    <div className="page doc-reader">
      <motion.div className="read-progress" style={{ scaleX: bar }} />
      <article className="narrow doc-article">
        <span className="eyebrow">原文阅读 · {d.origin}</span>
        <h1 className="doc-title">{d.title}</h1>
        {d.subtitle && <p className="doc-sub">——{d.subtitle}</p>}
        <p className="muted small">{d.authors.join("、")}{d.citation ? ` · ${d.citation}` : ""}</p>
        {d.quality?.ocr_fallback && <p className="ocr-note">本篇为 OCR 识别文本（{String(d.quality.ocr_fallback).includes("old OCR") ? "原扫描件旧文字层已重新识别" : "原文字层不可用"}），引用前请对照原页。</p>}
        {!d.canonical && d.alternates?.length ? <p className="ocr-note">本篇为重复副本，主本见 {d.alternates.map((a) => <Link key={a} className="link-zhu" to={`/doc/${a}`}>{a} </Link>)}</p> : null}
        {d.abstract && <div className="doc-abstract"><b>摘要</b> {d.abstract}</div>}
        {!!d.keywords?.length && <p className="small muted">关键词：{d.keywords.join("；")}</p>}
        <div className="doc-body">
          {d.blocks.map((b) => {
            const marker = b.page && b.page !== page ? <span className="page-mark" key={`p${b.page}`}>第 {(page = b.page)} 页</span> : null;
            const text = b.text.replace(/<[^>]+>/g, "");
            const cls = `blk t-${b.type} ${b.bid === target ? "hit" : ""}`;
            let el;
            if (b.type === "heading") el = <h3 id={b.bid} className={cls}>{text}</h3>;
            else if (b.type === "image") el = <figure id={b.bid} className={cls}>{b.asset && <img src={kbAsset(b.asset.replace("../assets/", ""))} alt={text} loading="lazy" />}<figcaption>{text}</figcaption></figure>;
            else if (b.type === "table") el = <div id={b.bid} className={cls} dangerouslySetInnerHTML={{ __html: b.text }} />;
            else el = <p id={b.bid} className={cls}>{text}<a className="bid" href={`#${b.bid}`}>{b.bid}</a></p>;
            return <span key={b.bid}>{marker}{el}</span>;
          })}
        </div>
        <div className="row doc-foot">
          <button className="btn zhu" onClick={() => openChat(`《${d.title}》的主要观点是什么？`)}>问小傅关于这篇文献</button>
          <span className="muted small">原件：{d.raw_path}</span>
        </div>
      </article>
    </div>
  );
}
