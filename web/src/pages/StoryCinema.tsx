import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { InkStage, preloadImages } from "../components/InkStage";
import { Markdown } from "../components/Markdown";
import { kbAsset, stripLinks, type Act, type Story } from "../lib/api";
import { actArt, artUrl, STORY_ART } from "../lib/scenes";
import { useAgent } from "../lib/store";

const EASE = [0.22, 1, 0.36, 1] as const;
const reduced = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function Narration({ act, titles, onDone }: { act: Act; titles: Record<string, string>; onDone: () => void }) {
  const text = stripLinks(act.text).replace(/\*\*/g, "");
  const [n, setN] = useState(0);
  const done = n >= text.length;
  useEffect(() => {
    if (reduced()) { setN(text.length); return; }
    setN(0);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(text.length, Math.floor(((now - t0) / 1000) * 24));
      setN(k);
      if (k < text.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text]);
  useEffect(() => { if (done) onDone(); }, [done]);
  return (
    <>
      <div className={`scine-text ${text.length < 24 ? "short" : ""}`} onClick={() => setN(text.length)} title={done ? undefined : "点击显示全文"}>
        {done ? <Markdown text={act.text} titles={titles} /> : <p>{text.slice(0, n)}<i className="scine-caret" /></p>}
      </div>
      <AnimatePresence>
        {done && act.source && act.source !== "—" && (
          <motion.div className="scine-src" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <Markdown text={`出处：${act.source}`} titles={titles} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function StoryCinema({ story, acts, rankLabel, charFor, sadAct, sad, onFinish }: {
  story: Story; acts: Act[]; rankLabel: string; charFor: (i: number) => string; sadAct: number; sad: boolean; onFinish: () => void;
}) {
  const { express } = useAgent();
  const symbols = story.mode === "symbols";
  const [i, setI] = useState(-1);
  const [dir, setDir] = useState(1);
  const [auto, setAuto] = useState(true);
  const [typed, setTyped] = useState(false);
  const secRef = useRef<HTMLElement>(null);
  const inView = useRef(true);
  const last = acts.length - 1;

  useEffect(() => { setI(-1); setTyped(false); }, [story.id]);
  useEffect(() => {
    const art = STORY_ART[story.id];
    if (art) preloadImages(art.acts.map((a) => artUrl(a.img)));
  }, [story.id]);

  const go = (j: number) => {
    const k = Math.max(-1, Math.min(last, j));
    if (k === i) return;
    setDir(k > i ? 1 : -1);
    setTyped(false);
    setI(k);
  };
  const next = () => (i >= last ? onFinish() : go(i + 1));
  const nextRef = useRef(next);
  nextRef.current = next;
  const goRef = useRef(go);
  goRef.current = go;
  const iRef = useRef(i);
  iRef.current = i;

  useEffect(() => {
    if (i < 0) return;
    if (sad && i === sadAct) express("sad", 5000);
    else if (i === last) express(sad ? "encourage" : "happy", 3000);
    else express("thinking", 1500);
  }, [i]);

  useEffect(() => {
    if (!auto || !typed || i < 0 || i >= last) return;
    const t = window.setTimeout(() => nextRef.current(), 4200);
    return () => window.clearTimeout(t);
  }, [auto, typed, i]);

  useEffect(() => {
    const el = secRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { inView.current = e.intersectionRatio > 0.5; }, { threshold: [0, 0.5, 1] });
    io.observe(el);
    const onKey = (e: KeyboardEvent) => {
      if (!inView.current || (e.target as HTMLElement)?.closest?.("input,textarea,[contenteditable]")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); nextRef.current(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goRef.current(iRef.current - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => { io.disconnect(); window.removeEventListener("keydown", onKey); };
  }, []);

  const touch = useRef<number | null>(null);
  const art = actArt(story.id, Math.max(0, i)) || { img: "chapter-3", fx: "dust" as const, focus: 0.5, tone: "dark" as const };
  const cur = i >= 0 ? acts[i] : null;
  const realImg = symbols && cur?.images?.[0];

  return (
    <section ref={secRef} className={`scine tone-${art.tone || "light"} ${i < 0 ? "opening" : ""}`}
      onPointerDown={(e) => { if (e.pointerType === "touch") touch.current = e.clientX; }}
      onPointerUp={(e) => {
        if (touch.current === null) return;
        const dx = e.clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) (dx < 0 ? next() : go(i - 1));
      }}>
      <InkStage src={artUrl(art.img)} fx={i < 0 ? "dust" : art.fx} focus={art.focus} tone={art.tone} dir={dir} duration={1600} />
      <div className="scine-shade" />

      <div className="scine-top">
        <Link to="/stories" className="scine-back">← 藏园故事</Link>
        <span className="scine-ep">重点故事 · 第{rankLabel}则</span>
      </div>

      <AnimatePresence mode="wait">
        {i < 0 ? (
          <motion.div key="open" className="scine-open" exit={{ opacity: 0, y: -24, filter: "blur(8px)" }} transition={{ duration: 0.5 }}>
            <motion.span className="scine-eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
              {symbols ? `${acts.length} 种校勘符号` : `${acts.length} 幕 · 约一分钟`} · {story.evidence_level}
            </motion.span>
            <h1 className="scine-title" aria-label={story.title}>
              {[...story.title].map((c, k) => (
                <motion.span key={k} initial={{ opacity: 0, y: 40, filter: "blur(12px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ delay: 0.25 + k * 0.06, duration: 0.9, ease: EASE }}>{c}</motion.span>
              ))}
            </h1>
            <motion.div className="scine-open-row" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 + story.title.length * 0.06 }}>
              <button className="scine-play" onClick={() => go(0)} autoFocus>
                <span className="scine-play-ring"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" /></svg></span>
                开始放映
              </button>
              <span className="scine-tip">← → 键 · 左右滑动 · 点击幕名都可切换</span>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div key={i} className={`scine-act ${realImg ? "with-real" : ""}`} initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18, filter: "blur(6px)" }} transition={{ duration: 0.55, ease: EASE }}>
            <motion.span className="scine-char brush" initial={{ scale: 1.6, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 15, delay: 0.15 }}>{charFor(i)}</motion.span>
            <div className="scine-body">
              <span className="scine-label">{symbols ? `符号 ${i + 1} / ${acts.length}` : `第 ${i + 1} 幕`}{cur!.label !== charFor(i) && ` · ${cur!.label}`}</span>
              <Narration act={cur!} titles={story.link_titles} onDone={() => setTyped(true)} />
            </div>
            {realImg && (
              <motion.figure className="scine-real" initial={{ opacity: 0, x: 40, rotate: 4 }} animate={{ opacity: 1, x: 0, rotate: 1.5 }} transition={{ delay: 0.35, duration: 0.8, ease: EASE }}>
                <img src={kbAsset(`images/thumbs/${realImg}.jpg`)} alt={`${cur!.label} 批校局部`} />
                <figcaption>真实材料 · 傅增湘校明本《通典》局部</figcaption>
              </motion.figure>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="scine-ctrl">
        <button className="scine-nav" onClick={() => go(i - 1)} disabled={i < 0} aria-label="上一幕">‹</button>
        <div className="scine-dots">
          {acts.map((a, k) => {
            const sub = a.label === charFor(k) ? (symbols ? `符号 ${k + 1}` : `第 ${k + 1} 幕`) : a.label;
            return (
            <button key={k} className={`${k === i ? "on" : ""} ${k < i ? "done" : ""}`} onClick={() => go(k)} aria-label={`${charFor(k)} ${sub}`}>
              <b className="brush">{charFor(k)}</b><span>{sub}</span>
              {k === i && auto && typed && k < last && <i className="scine-timer" />}
            </button>
            );
          })}
        </div>
        <button className={`scine-nav next ${i >= last ? "wide" : ""} ${i === last && typed ? "pulse" : ""}`} onClick={next} aria-label={i >= last ? "下一步" : "下一幕"}>
          {i >= last ? (symbols ? "认一认真实批校 →" : "排一排先后 →") : "›"}
        </button>
        <button className={`scine-auto ${auto ? "on" : ""}`} onClick={() => setAuto(!auto)} aria-pressed={auto} title="自动续播">
          {auto ? "自动续播 · 开" : "自动续播 · 关"}
        </button>
      </div>
      <div className="scine-progress"><motion.span animate={{ scaleX: (i + 1) / acts.length }} transition={{ duration: 0.8, ease: EASE }} /></div>
    </section>
  );
}
