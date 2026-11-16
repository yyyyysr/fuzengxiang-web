import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { InkStage, preloadImages } from "../components/InkStage";
import { stripLinks, type TimelineItem } from "../lib/api";
import { artUrl, CN_CAPS, LIFE_CHAPTERS, reignTitle, STORY_EVENT_ART, yearLabel, type ActArt } from "../lib/scenes";
import { useAgent } from "../lib/store";

type Entry = TimelineItem & { storyId: string; chapter: number; art: ActArt };

const STEP_VH = 64;
const EASE = [0.22, 1, 0.36, 1] as const;

export function buildEntries(items: TimelineItem[]): Entry[] {
  const linked = new Set(items.filter((t) => t.kind === "event" && t.story).map((t) => stripLinks(t.story)));
  return items
    .filter((t) => !(t.kind === "story" && linked.has(t.id)))
    .map((t) => {
      const y = parseInt(t.date.slice(0, 4), 10);
      const chapter = Math.max(0, LIFE_CHAPTERS.findIndex((c) => c.match(y, t.themes)));
      const ch = LIFE_CHAPTERS[chapter];
      const storyId = t.kind === "story" ? t.id : stripLinks(t.story || "");
      const art = STORY_EVENT_ART[storyId] || { img: ch.img, fx: ch.fx, focus: ch.focus, tone: ch.tone };
      return { ...t, storyId, chapter, art };
    });
}

type Book = "closed" | "opening" | "open";

const PRE_COLS = [
  "文章公器非可自私", "余自辛亥解官始事校雠", "每日校书以三十页为度", "必以他本过校一次", "藏园群书经眼录",
  "余之藏书手校者十居八九", "传播者十居四五", "藏园群书题记", "双鉴楼善本书目", "书魂永不散",
];
const PAGE_R = ["傅增湘年谱", "傅增湘字沅叔号藏园", "四川江安人", "同治十一年生", "光绪二十四年成进士"];
const PAGE_L = ["辛亥解官始事校雠", "得宋百衲本资治通鉴", "名其藏书处曰双鉴楼", "每日校书以三十页为度", "文章公器非可自私"];

function BookPage({ lines }: { lines: string[] }) {
  return (
    <div className="pb-page">
      <div className="pb-frame">{lines.map((l, i) => <p key={i} className={i === 0 ? "lead" : ""}>{l}</p>)}</div>
    </div>
  );
}

/** Opening ceremony: a closed thread-bound volume under a beam of light that opens into the chronicle. */
function Prelude({ phase, total, onOpen }: { phase: Book; total: number; onOpen: () => void }) {
  const motes = useMemo(() => Array.from({ length: 22 }, () => ({
    left: `${34 + Math.random() * 32}%`, top: `${20 + Math.random() * 70}%`,
    "--d": `${7 + Math.random() * 7}s`, "--o": `${-Math.random() * 10}s`, "--s": `${1 + Math.random() * 2.2}px`,
  }) as CSSProperties), []);
  return (
    <motion.div className={`pre ${phase}`} onClick={onOpen} exit={{ opacity: 0, transition: { duration: 0.9, ease: EASE } }}>
      <div className="pre-cols" aria-hidden>
        {PRE_COLS.map((q, i) => (
          <span key={i} style={{ "--i": i, left: `${i < 5 ? 3 + i * 5.6 : 72 + (i - 5) * 5.6}%`, top: `${4 + ((i * 37) % 30)}%` } as CSSProperties}>{q}</span>
        ))}
      </div>
      <div className="pre-beam" aria-hidden />
      <div className="pre-motes" aria-hidden>{motes.map((st, i) => <i key={i} style={st} />)}</div>
      <div className="pre-scene">
        <div className="pre-head">
          <h2 className="pre-title">{[..."傅增湘年谱"].map((c, i) => <span key={i} style={{ "--i": i } as CSSProperties}>{c}</span>)}</h2>
          <p className="pre-sub">一八七二 — 一九四九 · 六个篇章 · {total} 个时刻</p>
          <button className="pre-cta" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
            <i />点击开卷<i />
          </button>
        </div>
        <div className="pre-desk" aria-hidden>
          <div className="pre-book">
            <div className="pb-block"><BookPage lines={PAGE_L} /></div>
            <div className="pb-cover">
              <div className="pb-front">
                <div className="pb-slip"><span>傅增湘年谱</span></div>
                <div className="pb-label">藏园</div>
                <i className="pb-stitch" />
              </div>
              <div className="pb-back"><BookPage lines={PAGE_R} /></div>
            </div>
          </div>
        </div>
      </div>
      <div className="pre-flash" aria-hidden />
    </motion.div>
  );
}

function RollingYear({ year }: { year: string }) {
  return (
    <div className="roll-year" aria-hidden>
      {year.split("").map((d, i) => (
        <span key={i} className="roll-col">
          <motion.span className="roll-strip" animate={{ y: `${-Number(d) * 10}%` }}
            transition={{ type: "spring", stiffness: 60, damping: 16, delay: i * 0.07 }}>
            {"0123456789".split("").map((n) => <span key={n}>{n}</span>)}
          </motion.span>
        </span>
      ))}
    </div>
  );
}

export function LifeCinema({ items }: { items: TimelineItem[] }) {
  const entries = useMemo(() => buildEntries(items), [items]);
  const n = entries.length;
  const secRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [touched, setTouched] = useState(false);
  const idxRef = useRef(0);
  idxRef.current = idx;
  const jumpRef = useRef<{ to: number; until: number } | null>(null);
  const { openChat, express } = useAgent();

  const [book, setBook] = useState<Book>("closed");
  const bookRef = useRef<Book>("closed");
  const bookTimer = useRef(0);
  const setBookNow = (b: Book) => { bookRef.current = b; setBook(b); };
  const openBook = () => {
    if (bookRef.current !== "closed") return;
    setBookNow("opening");
    express("happy", 2600);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    bookTimer.current = window.setTimeout(() => setBookNow("open"), reduced ? 150 : 2050);
  };
  const openRef = useRef(openBook);
  openRef.current = openBook;
  useEffect(() => () => window.clearTimeout(bookTimer.current), []);

  useEffect(() => {
    if (!n) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = secRef.current;
      if (!el) return;
      const span = Math.max(1, el.offsetHeight - window.innerHeight);
      const v = Math.max(0, Math.min(1, -el.getBoundingClientRect().top / span));
      if (bookRef.current === "closed" && v * n > 0.6) {
        if (v * n > 1.5) setBookNow("open");
        else openRef.current();
      }
      const i = Math.min(n - 1, Math.floor(v * n));
      const jump = jumpRef.current;
      if (jump) {
        if (i !== jump.to && performance.now() < jump.until) return;
        jumpRef.current = null;
      }
      if (i !== idxRef.current) setIdx(i);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [n]);

  useEffect(() => {
    const t = window.setTimeout(() => preloadImages([...new Set(entries.map((e) => artUrl(e.art.img)))]), 600);
    return () => window.clearTimeout(t);
  }, [entries]);

  const go = (i: number) => {
    const el = secRef.current;
    if (!el || !n) return;
    const j = Math.max(0, Math.min(n - 1, i));
    const top = el.getBoundingClientRect().top + window.scrollY;
    const target = top + (el.offsetHeight - window.innerHeight) * ((j + 0.5) / n);
    const lenis = (window as any).__lenis;
    if (lenis) lenis.scrollTo(target, { duration: 1.1 });
    else window.scrollTo({ top: target, behavior: "smooth" });
    if (bookRef.current !== "open") { window.clearTimeout(bookTimer.current); setBookNow("open"); }
    if (Math.abs(j - idxRef.current) > 1) {
      jumpRef.current = { to: j, until: performance.now() + 1600 };
      setIdx(j);
    }
    setTouched(true);
  };
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !n) return;
    let lockUntil = 0, acc = 0;
    const pinned = () => {
      const r = secRef.current!.getBoundingClientRect();
      return r.top <= 2 && r.bottom >= window.innerHeight - 2;
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || !pinned()) return;
      const dir = Math.sign(e.deltaY);
      if (!dir) return;
      const now = performance.now();
      const b = bookRef.current;
      if (b !== "open") {
        if (b === "closed" && dir < 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (b === "closed") { lockUntil = now + 2200; openRef.current(); }
        return;
      }
      const i = idxRef.current;
      const leaving = (dir < 0 && i === 0) || (dir > 0 && i === n - 1);
      if (leaving && now >= lockUntil) return;
      e.preventDefault();
      e.stopPropagation();
      if (now < lockUntil) return;
      acc += e.deltaY;
      if (Math.abs(acc) < 24) return;
      acc = 0;
      lockUntil = now + 950;
      goRef.current(i + dir);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!pinned() || (e.target as HTMLElement)?.closest?.("input,textarea,[contenteditable]")) return;
      const fwd = ["ArrowDown", "PageDown", "ArrowRight"].includes(e.key);
      if (bookRef.current !== "open") {
        if (fwd) { e.preventDefault(); openRef.current(); }
        return;
      }
      const i = idxRef.current;
      if (fwd && i < n - 1) { e.preventDefault(); goRef.current(i + 1); }
      if (["ArrowUp", "PageUp", "ArrowLeft"].includes(e.key) && i > 0) { e.preventDefault(); goRef.current(i - 1); }
    };
    let ty = 0;
    const onTouchStart = (e: TouchEvent) => { ty = e.touches[0].clientY; };
    const onTouchMove = (e: TouchEvent) => {
      const b = bookRef.current;
      if (b === "open" || !pinned()) return;
      const dy = ty - e.touches[0].clientY;
      if (b === "closed" && dy < 0) return;
      e.preventDefault();
      if (b === "closed" && dy > 18) openRef.current();
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("touchstart", onTouchStart, { passive: true });
    stage.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [n]);

  const [shown, setShown] = useState(0);
  const dirRef = useRef(1);
  const crossRef = useRef(false);
  useEffect(() => {
    if (idx === shown) return;
    const t = window.setTimeout(() => {
      dirRef.current = idx > shown ? 1 : -1;
      crossRef.current = entries[idx]?.chapter !== entries[shown]?.chapter;
      setShown(idx);
    }, 140);
    return () => window.clearTimeout(t);
  }, [idx, shown, entries]);

  const colsRef = useRef<HTMLDivElement>(null);
  const chapterNo = entries[shown]?.chapter;
  useEffect(() => {
    if (chapterNo === undefined) return;
    if (touched) express("thinking", 1400);
    const box = colsRef.current, col = box?.querySelector<HTMLElement>(".cine-col.on");
    if (box && col && box.scrollWidth > box.clientWidth) box.scrollTo({ left: col.offsetLeft - 16, behavior: "smooth" });
  }, [chapterNo]);

  if (!n) return null;
  const cur = entries[Math.min(shown, n - 1)];
  const ch = LIFE_CHAPTERS[cur.chapter];
  const source = cur.kind === "story" ? `/stories/${encodeURIComponent(cur.id)}` : `/wiki/${encodeURIComponent(cur.id)}`;
  // Chapter breaks roll a smoke wall across the stage; hold the new copy until it has passed the text column.
  const lag = crossRef.current ? 0.75 : 0;

  return (
    <section ref={secRef} className="cine" style={{ height: `calc(${n * STEP_VH}vh + 100vh)` }}>
      <div className={`cine-sticky tone-${cur.art.tone || "light"}`} ref={stageRef}>
        <InkStage src={artUrl(cur.art.img)} fx={cur.art.fx} focus={cur.art.focus} tone={cur.art.tone} dir={dirRef.current} veil={cur.chapter} />
        <div className="cine-shade" />
        <RollingYear year={cur.date.slice(0, 4)} />

        <AnimatePresence>
          {book !== "open" && <Prelude key="pre" phase={book} total={n} onOpen={openBook} />}
        </AnimatePresence>

        {book === "open" && <div className="cine-copy">
          <AnimatePresence mode="wait">
            <motion.div key={ch.no} className="cine-chapter" exit={{ opacity: 0, x: -24, filter: "blur(6px)" }} transition={{ duration: 0.45 }}>
              <motion.span className="cine-seal" initial={{ scale: 1.8, opacity: 0, rotate: -25 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 16, delay: lag }}>
                <svg viewBox="0 0 52 52"><polygon points="16,1 36,1 51,16 51,36 36,51 16,51 1,36 1,16" /><polygon points="18,5.5 34,5.5 46.5,18 46.5,34 34,46.5 18,46.5 5.5,34 5.5,18" opacity="0.5" /></svg>
                <b>{CN_CAPS[ch.no]}</b>
              </motion.span>
              <h2 className="cine-title" aria-label={ch.name}>
                {[...ch.name].map((c, i) => (
                  <motion.span key={i} initial={{ opacity: 0, y: 34, filter: "blur(10px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ delay: lag + 0.12 + i * 0.09, duration: 0.9, ease: EASE }}>{c}</motion.span>
                ))}
              </h2>
              <motion.p className="cine-lead" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: lag + 0.5, duration: 0.8 }}>
                <span>{ch.range}</span>{ch.lead}
              </motion.p>
            </motion.div>
          </AnimatePresence>
          <AnimatePresence mode="wait">
            <motion.div key={cur.id} className="cine-event" initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE, delay: lag && lag + 0.4 } }}
              exit={{ opacity: 0, y: -14, transition: { duration: 0.4, ease: EASE } }}>
              <div className="cine-year">{yearLabel(cur.date)}{cur.date_end ? ` — ${cur.date_end}` : ""}</div>
              <h3>{cur.title}</h3>
              <p>{stripLinks(cur.summary)}</p>
              <div className="cine-tags">
                {cur.storyId && <span className="seal solid">重点故事</span>}
                {cur.disputed && <span className="seal gold">有异说</span>}
                {cur.themes.slice(0, 3).map((t) => <span key={t} className="seal">{t}</span>)}
                {cur.evidence_level && <span className="cine-ev">证据：{cur.evidence_level}</span>}
              </div>
              <div className="cine-actions">
                {cur.storyId && <Link className="btn small solid" to={`/stories/${encodeURIComponent(cur.storyId)}`}>进入故事 →</Link>}
                <Link className="btn small light" to={source}>查看出处</Link>
                <button className="btn small light" onClick={() => openChat(`请讲讲：${cur.title}（${cur.date}）`)}>问小傅</button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>}

        <div className="cine-count"><b>{String(idx + 1).padStart(2, "0")}</b> / {String(n).padStart(2, "0")}</div>

        <div className="cine-bar">
          <AnimatePresence>
            {!touched && (
              <motion.div className="cine-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <span className="cine-mouse"><i /></span>
                <span>滚轮或方向键翻阅<br />也可点击下方进度条跳转</span>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="cine-cols" ref={colsRef}>
            {LIFE_CHAPTERS.map((c, ci) => {
              const list = entries.map((e, i) => [e, i] as const).filter(([e]) => e.chapter === ci);
              if (!list.length) return null;
              return (
                <div key={c.no} className={`cine-col ${ci === cur.chapter ? "on" : ""} ${ci < cur.chapter ? "done" : ""}`}>
                  <div className="cine-segs">
                    {list.map(([e, i]) => (
                      <button key={e.id} className={`cine-seg ${i < idx ? "past" : ""} ${i === idx ? "cur" : ""} ${e.storyId ? "story" : ""}`}
                        onClick={() => go(i)} aria-label={`${e.date} ${e.title}`}>
                        <span className="cine-tip"><b>{e.date.slice(0, 4)}年</b>{reignTitle(e.date) || e.title.slice(0, 8)}</span>
                      </button>
                    ))}
                  </div>
                  <button className="cine-tab" onClick={() => go(list[0][1])}>
                    <b>{c.name}</b><span>{c.range}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <span className="cine-ai">画面为 AI 示意图，非历史影像</span>
      </div>
    </section>
  );
}
