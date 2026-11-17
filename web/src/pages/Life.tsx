import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { CloudDivider, ErrorNote, Loading, PageHeader, Reveal, SplitText } from "../components/ui";
import { api, kbAsset, stripLinks, type TimelineItem, type WikiPage } from "../lib/api";
import { bullets, parseTable, yearOf } from "../lib/md";
import { useAgent, usePageAgent } from "../lib/store";
import { LifeCinema } from "./LifeCinema";

const THEMES = ["藏书", "校书", "影印", "图书馆", "教育", "交游", "访书", "护书", "捐赠", "生平"];
const CONTRIB_ICON = ["访", "鉴", "校", "传", "教"];

export function Life() {
  const [fu, setFu] = useState<WikiPage | null>(null);
  const [tl, setTl] = useState<TimelineItem[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<WikiPage>("/wiki/傅增湘").then(setFu).catch((e) => setErr(e.message));
    api<TimelineItem[]>("/timeline").then(setTl).catch((e) => setErr(e.message));
  }, []);
  usePageAgent({
    id: "傅增湘", title: "傅增湘",
    tip: "年谱分六个篇章，滚轮一下翻一年。想按“藏书、校书、教育”筛选，切到列表模式就行。",
    questions: ["傅增湘为什么从教育总长任上辞职？", "傅增湘一生校了多少书？数字有没有分歧？"],
  });
  if (err) return <div className="page"><ErrorNote msg={err} /></div>;
  return (
    <div className="page life">
      <PageHeader
        eyebrow="认识傅增湘"
        title="一位藏书家的七十八年"
        lead={<p>从江安少年到双鉴楼主人：他如何访书、辨书、校书、护书，又如何让一部部孤本“化身千百”。</p>}
        side={<div className="portrait-pair"><img src={kbAsset("images/thumbs/img-0069.jpg")} alt="藏园校书图（徐悲鸿绘）" /><img src={kbAsset("images/thumbs/img-0009.jpg")} alt="傅增湘像" /></div>}
      />
      {fu ? <Intro fu={fu} /> : <div className="container"><Loading /></div>}
      <Chronicle items={tl} />
      {fu && <Disputes fu={fu} />}
    </div>
  );
}

function Chronicle({ items }: { items: TimelineItem[] }) {
  const [mode, setMode] = useState<"cinema" | "list">("cinema");
  return (
    <>
      <section className="container chron-head">
        <Reveal className="center">
          <span className="eyebrow">互动年谱 · 流光</span>
          <h2 className="section-title brush"><SplitText text="七十八年，六个篇章" inView /></h2>
          <CloudDivider />
          <p className="muted">从江安少年到双鉴楼主人。滚动翻阅每一年；想快速浏览或按主题筛选，可切换到列表。</p>
          <div className="seg-toggle" role="tablist">
            <button role="tab" aria-selected={mode === "cinema"} className={mode === "cinema" ? "on" : ""} onClick={() => setMode("cinema")}>影院模式</button>
            <button role="tab" aria-selected={mode === "list"} className={mode === "list" ? "on" : ""} onClick={() => setMode("list")}>列表模式</button>
          </div>
        </Reveal>
      </section>
      {mode === "cinema" ? <LifeCinema items={items} /> : <Timeline items={items} />}
    </>
  );
}

function Intro({ fu }: { fu: WikiPage }) {
  const quick = bullets(fu.sections["三十秒介绍"] || "");
  const contrib = parseTable(fu.sections["贡献五项"] || "").slice(1);
  const [flip, setFlip] = useState<number | null>(null);
  return (
    <>
      <section className="container section-sm">
        <Reveal className="quick-intro paper-card card">
          <div className="quick-lead">
            <span className="seal solid">三十秒</span>
            <Markdown text={fu.sections["_intro"]?.replace(/^#.*\n/, "") || ""} titles={fu.link_titles} />
          </div>
          <div className="quick-grid">
            {quick.map((q, i) => (
              <Reveal key={i} delay={i * 0.1} className="quick-item">
                <Markdown text={q} titles={fu.link_titles} />
              </Reveal>
            ))}
          </div>
        </Reveal>
      </section>
      <section className="container section-sm">
        <Reveal className="center"><span className="eyebrow">贡献五项</span><h2 className="section-title brush"><SplitText text="不以称号代替事例" inView /></h2><CloudDivider /></Reveal>
        <div className="contrib-grid">
          {contrib.map((row, i) => (
            <Reveal key={i} delay={i * 0.08}>
              <div role="button" tabIndex={0} className={`contrib ${flip === i ? "flipped" : ""}`} onClick={() => setFlip(flip === i ? null : i)}
                onKeyDown={(e) => e.key === "Enter" && setFlip(flip === i ? null : i)} aria-expanded={flip === i}>
                <div className="contrib-front">
                  <span className="contrib-icon brush">{CONTRIB_ICON[i] || "·"}</span>
                  <h3>{row[0]}</h3>
                  <span className="muted small">点击翻看事例</span>
                </div>
                <div className="contrib-back" onClick={(e) => e.stopPropagation()}>
                  <h4>{row[0]}</h4>
                  <Markdown text={row[1]} titles={fu.link_titles} />
                  <span className="contrib-close" onClick={() => setFlip(null)}>翻回</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  );
}

function Timeline({ items }: { items: TimelineItem[] }) {
  const [theme, setTheme] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const { openChat, express } = useAgent();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 40%"] });
  const spine = useSpring(scrollYProgress, { stiffness: 90, damping: 26 });
  const shown = useMemo(() => items.filter((t) => !theme || t.themes.includes(theme)), [items, theme]);
  const counts = useMemo(() => Object.fromEntries(THEMES.map((th) => [th, items.filter((t) => t.themes.includes(th)).length])), [items]);
  let lastYear = "";

  return (
    <section className="section timeline-sec">
      <div className="container">
        <div className="tl-filters">
          <button className={`chip ${!theme ? "active" : ""}`} onClick={() => setTheme(null)}>全部 {items.length}</button>
          {THEMES.filter((t) => counts[t]).map((t) => (
            <button key={t} className={`chip ${theme === t ? "active" : ""}`} onClick={() => { setTheme(t); express("thinking", 1500); }}>{t} {counts[t]}</button>
          ))}
        </div>
        <div className="timeline" ref={ref}>
          <div className="tl-spine"><motion.span style={{ scaleY: spine }} /></div>
          <AnimatePresence mode="popLayout">
            {shown.map((t, i) => {
              const y = yearOf(t.date);
              const showYear = y !== lastYear;
              lastYear = y;
              const isOpen = open === t.id;
              return (
                <motion.div key={t.id} layout className={`tl-item ${i % 2 ? "right" : "left"} ${t.kind}`}
                  initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
                  exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
                  {showYear && <span className="tl-year brush">{y}</span>}
                  <span className={`tl-dot ${t.kind === "story" ? "story" : ""}`} />
                  <div className={`tl-card card ${isOpen ? "open" : ""}`} onClick={() => setOpen(isOpen ? null : t.id)}>
                    <div className="tl-meta">
                      <span className="muted small">{t.date}{t.date_end ? ` — ${t.date_end}` : ""}</span>
                      {t.kind === "story" && <span className="seal solid">重点故事</span>}
                      {t.disputed && <span className="seal gold">有异说</span>}
                      {t.themes.slice(0, 2).map((th) => <span key={th} className="seal qing">{th}</span>)}
                    </div>
                    <h3>{t.title}</h3>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div className="tl-detail" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                          <p>{stripLinks(t.summary)}</p>
                          {t.evidence_level && <p className="muted small">证据：{t.evidence_level}</p>}
                          <div className="row" onClick={(e) => e.stopPropagation()}>
                            {t.kind === "story" || t.story
                              ? <Link className="btn small solid" to={`/stories/${encodeURIComponent(t.kind === "story" ? t.id : stripLinks(t.story))}`}>进入故事</Link>
                              : null}
                            <Link className="btn small" to={t.kind === "story" ? `/stories/${encodeURIComponent(t.id)}` : `/wiki/${encodeURIComponent(t.id)}`}>查看出处</Link>
                            <button className="btn small zhu" onClick={() => openChat(`请讲讲：${t.title}（${t.date}）`)}>问小傅</button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function Disputes({ fu }: { fu: WikiPage }) {
  const items = bullets(fu.sections["待核"] || "");
  if (!items.length) return null;
  return (
    <section className="container section-sm">
      <Reveal className="card disputes">
        <span className="seal gold">有分歧的地方</span>
        <h3>同一个数字，不同的说法</h3>
        <p className="muted small">下面这些说法在不同材料中并不一致。网站按“出处并列、不强行定论”的原则呈现。</p>
        <ul>{items.map((d, i) => <li key={i}><Markdown text={d} titles={fu.link_titles} /></li>)}</ul>
      </Reveal>
    </section>
  );
}
