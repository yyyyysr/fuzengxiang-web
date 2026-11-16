import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { TiltLink } from "../components/Tilt";
import { CloudDivider, ErrorNote, Loading, PageHeader, Reveal } from "../components/ui";
import { api, kbAsset, stripLinks, type Act, type Story, type StoryCard, type TimelineItem } from "../lib/api";
import { artUrl, STORY_ART } from "../lib/scenes";
import { useAgent, usePageAgent } from "../lib/store";
import { StoryCinema } from "./StoryCinema";

const SAD_STORIES = new Set(["乐府诗集避火", "水灾运书", "东坡和陶诗失窃", "海源阁遗书散出", "永乐大典六册"]);
const ACT_CHAR = ["起", "承", "转", "合"];
const CN_NUM = "〇一二三四五六七八九十";

export function Stories() {
  const [list, setList] = useState<StoryCard[]>([]);
  const [tl, setTl] = useState<TimelineItem[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<StoryCard[]>("/stories").then(setList).catch((e) => setErr(e.message));
    api<TimelineItem[]>("/timeline").then(setTl).catch(() => {});
  }, []);
  usePageAgent({ tip: "十个重点故事，每个都是一场一分钟的放映：看完几幕，再把事情的先后排一排。", questions: ["哪个故事最适合第一次来的读者？", "《永乐大典》六册最后去了哪里？"] });
  const others = tl.filter((t) => t.kind === "event" && !t.story);
  return (
    <div className="page stories">
      <PageHeader eyebrow="藏园故事" title="一件与书有关的事，后来怎样了" lead={<p>访书、护书、校书、影印、公藏——十个有材料支撑的故事，逐幕放映，再由你排出先后。每一幕的文字都可回到出处。</p>} />
      {err && <ErrorNote msg={err} />}
      <section className="container">
        {!list.length && !err && <Loading h={420} />}
        <div className="story-grid poster-wall">
          {list.map((s, i) => {
            const poster = STORY_ART[s.id]?.poster;
            return (
              <Reveal key={s.id} delay={(i % 3) * 0.08} className={i === 0 ? "poster-hero" : ""}>
                <TiltLink to={`/stories/${encodeURIComponent(s.id)}`} className={`story-card poster ${SAD_STORIES.has(s.id) ? "sad" : ""}`}>
                  <div className="poster-img">
                    {poster && <img src={artUrl(poster, i !== 0)} alt="" loading="lazy" />}
                    <span className="story-no brush">{CN_NUM[s.rank] || s.rank}</span>
                  </div>
                  <div className="story-card-body">
                    <span className="muted small">{s.date}{s.date_end ? ` — ${s.date_end}` : ""}</span>
                    <h3>{s.title}</h3>
                    <p>{s.one_liner || s.summary}</p>
                    <div className="row">{s.themes.map((t) => <span key={t} className="seal qing">{t}</span>)}<span className="seal">{s.evidence_level}</span></div>
                  </div>
                  <span className="story-go">▶ 放映</span>
                </TiltLink>
              </Reveal>
            );
          })}
        </div>
      </section>
      {!!others.length && (
        <section className="container section">
          <Reveal className="center"><span className="eyebrow">时间索引</span><h2 className="section-title brush">其他有据可查的事</h2><CloudDivider /></Reveal>
          <div className="time-index">
            {others.map((t, i) => (
              <Reveal key={t.id} delay={(i % 6) * 0.04}>
                <Link to={`/wiki/${encodeURIComponent(t.id)}`} className="ti-item">
                  <span className="ti-year brush">{t.date.slice(0, 4)}</span>
                  <span className="ti-title">{t.title}</span>
                  <span className="muted small">{stripLinks(t.summary).slice(0, 40)}</span>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function StoryDetail() {
  const { id = "" } = useParams();
  const [s, setS] = useState<Story | null>(null);
  const [all, setAll] = useState<StoryCard[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    setS(null);
    api<Story>(`/stories/${encodeURIComponent(id)}`).then(setS).catch((e) => setErr(e.message));
    api<StoryCard[]>("/stories").then(setAll).catch(() => {});
  }, [id]);
  usePageAgent(s ? {
    id: s.id, title: s.title,
    tip: SAD_STORIES.has(s.id) ? "这是一个书遭遇险境的故事。点“开始放映”，每一幕下方都标着出处。" : "点“开始放映”，看看问题从哪里出现。用 ← → 键也能切换。",
    questions: [`${s.title}——这件事的原始依据是什么？`, `这个故事里还有哪些地方待核？`],
  } : {}, [s?.id]);
  if (err) return <div className="page"><ErrorNote msg={err} /></div>;
  if (!s) return <div className="page container"><Loading h={500} /></div>;
  const idx = all.findIndex((x) => x.id === s.id);
  const next = all[(idx + 1) % (all.length || 1)];
  return (
    <div className="page story-detail">
      <Player story={s} rankLabel={CN_NUM[s.rank] || String(s.rank)} />
      {!!s.images?.length && (
        <section className="container section-sm">
          <Reveal><span className="eyebrow">真实材料</span><h2 className="section-title brush">批校原件局部</h2></Reveal>
          <div className="story-images">
            {s.images.map((im) => (
              <Reveal key={im.id} className="story-img"><img src={kbAsset(im.thumb)} alt={im.title} loading="lazy" /><span>{im.title}</span></Reveal>
            ))}
          </div>
        </section>
      )}
      <section className="container section-sm story-foot">
        <div className="grid cols-2">
          <Reveal className="card">
            <h3>完整情节卡与出处</h3>
            <Markdown text={s.sections["情节卡"] || s.sections["情节卡（四幕）"] || s.sections["情节卡（待补全）"] || s.sections["时间线"] || ""} titles={s.link_titles} />
          </Reveal>
          <Reveal className="card" delay={0.1}>
            {s.operation && (<><h3>设计提示</h3><Markdown text={s.operation} titles={s.link_titles} /></>)}
            {s.pending && (<><h3 style={{ marginTop: 16 }}>待核</h3><Markdown text={s.pending} titles={s.link_titles} /></>)}
            <div className="row" style={{ marginTop: 16 }}>
              <Link className="btn small" to={`/wiki/${encodeURIComponent(s.id)}`}>知识页全文</Link>
              {next && next.id !== s.id && <Link className="btn small solid" to={`/stories/${encodeURIComponent(next.id)}`}>下一个故事：{next.title.slice(0, 12)} →</Link>}
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

function shortAct(a: Act) {
  const t = stripLinks(a.text).replace(/\*\*/g, "");
  return t.length > 46 ? t.slice(0, 44) + "…" : t;
}

function Player({ story, rankLabel }: { story: Story; rankLabel: string }) {
  const acts = story.acts.slice(0, 6);
  const symbols = story.mode === "symbols";
  const sad = SAD_STORIES.has(story.id);
  const sadAct = acts.length === 4 ? 2 : -1;
  const charFor = (i: number) => (symbols ? acts[i].label.replace(/[^\u4e00-\u9fff]/g, "").slice(-2, -1) || acts[i].label[0]
    : acts.length === 4 ? ACT_CHAR[i] : CN_NUM[i + 1]);
  const { express, openChat } = useAgent();
  const [replay, setReplay] = useState(0);
  const gameRef = useRef<HTMLElement>(null);
  const [stage, setStage] = useState<"acts" | "order" | "reveal">("acts");
  const [order, setOrder] = useState<number[]>([]);
  const [wrong, setWrong] = useState<number | null>(null);
  const quiz = useMemo(() => acts.flatMap((a, i) => (a.images || []).map((img) => ({ img, answer: i })))
    .sort((x, y) => ((x.img.charCodeAt(8) * 37) % 11) - ((y.img.charCodeAt(8) * 37) % 11)), [story.id]);
  const [qi, setQi] = useState(0);
  const [qPicked, setQPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const shuffled = useMemo(() => {
    const arr = acts.map((_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(((i * 7919 + story.id.length * 31) % 997) / 997 * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    if (arr.every((v, i) => v === i)) arr.reverse();
    return arr;
  }, [story.id, acts.length]);
  useEffect(() => { setStage("acts"); setOrder([]); setQi(0); setQPicked(null); setScore(0); }, [story.id]);

  const scrollTo = (target: HTMLElement | number) => {
    const lenis = (window as any).__lenis;
    if (lenis) lenis.scrollTo(target, { offset: typeof target === "number" ? 0 : -84, duration: 1.2 });
    else if (typeof target === "number") window.scrollTo({ top: target, behavior: "smooth" });
    else target.scrollIntoView({ behavior: "smooth" });
  };
  function toGame() {
    setStage((s) => (s === "acts" ? "order" : s));
    express("thinking", 2000);
    requestAnimationFrame(() => gameRef.current && scrollTo(gameRef.current));
  }
  function replayCinema() {
    setStage("acts"); setOrder([]); setQi(0); setScore(0);
    setReplay((r) => r + 1);
    scrollTo(0);
  }

  function answer(i: number) {
    if (qPicked !== null) return;
    setQPicked(i);
    const ok = i === quiz[qi].answer;
    if (ok) setScore((s) => s + 1);
    express(ok ? "happy" : "encourage", 1800);
    window.setTimeout(() => {
      setQPicked(null);
      if (qi + 1 >= quiz.length) setStage("reveal");
      else setQi(qi + 1);
    }, ok ? 900 : 1700);
  }

  function pick(i: number) {
    if (order.includes(i)) return;
    if (i !== order.length) {
      setWrong(i);
      express("encourage", 2000);
      window.setTimeout(() => setWrong(null), 600);
      return;
    }
    const o = [...order, i];
    setOrder(o);
    if (o.length === acts.length) {
      express(sad ? "encourage" : "happy", 4000);
      window.setTimeout(() => setStage("reveal"), 900);
    }
  }

  if (!acts.length) return null;
  return (
    <>
    <StoryCinema key={`${story.id}-${replay}`} story={story} acts={acts} rankLabel={rankLabel} charFor={charFor} sadAct={sadAct} sad={sad} onFinish={toGame} />
    <section className="player container" ref={gameRef}>
      <div className="player-steps">
        {(symbols ? ["认识符号", "认一认批校", "看懂校勘"] : ["观看放映", "排列先后", "史实揭晓"]).map((t, i) => (
          <span key={t} className={["acts", "order", "reveal"].indexOf(stage) >= i ? "on" : ""}><b>{i + 1}</b>{t}</span>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {stage === "acts" && (
          <motion.div key="acts" className="center player-wait" exit={{ opacity: 0, y: -20 }}>
            <p className="player-hint">{symbols ? `先在上方看完 ${acts.length} 种校勘符号，再用真实批校局部考考自己。` : `先在上方看完 ${acts.length} 幕放映，再把情节按先后排一排。`}</p>
            <button className="btn" onClick={toGame}>{symbols ? "跳过放映，直接认批校 →" : "跳过放映，直接排序 →"}</button>
          </motion.div>
        )}
        {stage === "order" && symbols && quiz[qi] && (
          <motion.div key={`quiz-${qi}`} className="quiz" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
            <p className="player-hint">第 {qi + 1} / {quiz.length} 张批校局部：这是哪一种校勘符号？</p>
            <div className="quiz-body">
              <img src={kbAsset(`images/thumbs/${quiz[qi].img}.jpg`)} alt="批校局部" />
              <div className="quiz-options">
                {acts.map((a, i) => {
                  const state = qPicked === null ? "" : i === quiz[qi].answer ? "right" : i === qPicked ? "wrong" : "";
                  return <button key={i} className={`pool-card ${state}`} onClick={() => answer(i)}><b className="brush">{charFor(i)}</b> {a.label}</button>;
                })}
              </div>
            </div>
            <p className="muted small center">图片来源：刘毅超文配图（傅增湘校明本《通典》）。答对 {score} 张。</p>
          </motion.div>
        )}
        {stage === "order" && !symbols && (
          <motion.div key="order" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <p className="player-hint">卡片被打乱了。按事情发生的先后，依次点击它们。</p>
            <div className="order-slots" style={{ gridTemplateColumns: acts.length > 4 ? `repeat(${Math.min(acts.length, 5)}, 1fr)` : undefined }}>
              {acts.map((_, i) => (
                <div key={i} className={`slot ${order[i] !== undefined ? "filled" : ""}`}>
                  <span className="brush">{charFor(i)}</span>
                  {order[i] !== undefined && <motion.p initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>{shortAct(acts[order[i]])}</motion.p>}
                </div>
              ))}
            </div>
            <div className="order-pool">
              {shuffled.map((i) => (
                <motion.button key={i} className={`pool-card ${order.includes(i) ? "used" : ""} ${wrong === i ? "wrong" : ""}`} onClick={() => pick(i)}
                  animate={wrong === i ? { x: [0, -8, 8, -6, 6, 0] } : {}} transition={{ duration: 0.45 }} disabled={order.includes(i)}>
                  {shortAct(acts[i])}
                </motion.button>
              ))}
            </div>
            <div className="center"><button className="btn ghost small" onClick={() => setStage("reveal")}>跳过，直接揭晓</button></div>
          </motion.div>
        )}
        {stage === "reveal" && (
          <motion.div key="reveal" className="reveal-box" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }}>
            <motion.div className="reveal-stamp" initial={{ scale: 2.4, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: -8 }} transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.3 }}>史实</motion.div>
            <h3 className="brush">{symbols ? "看懂校勘" : "合 · 史实揭晓"}</h3>
            {symbols && quiz.length > 0 && <p className="muted">你认对了 {score} / {quiz.length} 张批校局部。</p>}
            <p className="reveal-text">{story.one_liner || story.summary}</p>
            {symbols && <p className="muted small">提醒：宋本与明本不同，并不自动等于宋本正确——校勘要据证据判断。</p>}
            <p className="muted small">证据层级：{story.evidence_level}。故事的每一幕都能回到原文，点击上方卡片中的出处即可查看。</p>
            <div className="row center-row">
              <button className="btn" onClick={replayCinema}>再看一遍放映</button>
              <button className="btn zhu" onClick={() => openChat(`关于“${story.title}”，原始材料是怎么记载的？`)}>问小傅：依据是什么？</button>
              <Link className="btn solid" to="/cases">去史料侦探 →</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
    </>
  );
}
