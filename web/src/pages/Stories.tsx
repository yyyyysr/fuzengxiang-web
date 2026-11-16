import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { CloudDivider, ErrorNote, Loading, PageHeader, Reveal } from "../components/ui";
import { api, kbAsset, stripLinks, type Act, type Story, type StoryCard, type TimelineItem } from "../lib/api";
import { bullets } from "../lib/md";
import { useAgent, usePageAgent } from "../lib/store";

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
  usePageAgent({ tip: "十个重点故事，每个大约一分钟：翻开四张线索卡，再把事情的先后排一排。", questions: ["哪个故事最适合第一次来的读者？", "《永乐大典》六册最后去了哪里？"] });
  const others = tl.filter((t) => t.kind === "event" && !t.story);
  return (
    <div className="page stories">
      <PageHeader eyebrow="藏园故事" title="一件与书有关的事，后来怎样了" lead={<p>访书、护书、校书、影印、公藏——十个有材料支撑的故事，邀请你亲手翻开线索。互动画面若为示意，会注明性质。</p>} />
      {err && <ErrorNote msg={err} />}
      <section className="container">
        {!list.length && !err && <Loading h={420} />}
        <div className="story-grid">
          {list.map((s, i) => (
            <Reveal key={s.id} delay={(i % 3) * 0.08}>
              <Link to={`/stories/${encodeURIComponent(s.id)}`} className={`story-card ${SAD_STORIES.has(s.id) ? "sad" : ""}`}>
                <span className="story-no brush">{CN_NUM[s.rank] || s.rank}</span>
                <div className="story-card-body">
                  <span className="muted small">{s.date}{s.date_end ? ` — ${s.date_end}` : ""}</span>
                  <h3>{s.title}</h3>
                  <p>{s.one_liner || s.summary}</p>
                  <div className="row">{s.themes.map((t) => <span key={t} className="seal qing">{t}</span>)}<span className="seal">{s.evidence_level}</span></div>
                </div>
                <span className="story-go">翻开 →</span>
              </Link>
            </Reveal>
          ))}
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
    tip: SAD_STORIES.has(s.id) ? "这是一个书遭遇险境的故事。慢慢翻，每张卡背后都有出处。" : "先翻开第一张线索卡，看看问题从哪里出现。",
    questions: [`${s.title}——这件事的原始依据是什么？`, `这个故事里还有哪些地方待核？`],
  } : {}, [s?.id]);
  if (err) return <div className="page"><ErrorNote msg={err} /></div>;
  if (!s) return <div className="page container"><Loading h={500} /></div>;
  const idx = all.findIndex((x) => x.id === s.id);
  const next = all[(idx + 1) % (all.length || 1)];
  return (
    <div className="page story-detail">
      <header className="container story-head">
        <Link to="/stories" className="muted small">← 藏园故事</Link>
        <motion.span className="story-head-no brush" initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 0.12, scale: 1 }} transition={{ duration: 1.2 }}>{CN_NUM[s.rank] || ""}</motion.span>
        <span className="eyebrow">重点故事 · 第{CN_NUM[s.rank] || s.rank}则</span>
        <motion.h1 className="page-title" initial={{ opacity: 0, y: 24, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 1 }}>{s.title}</motion.h1>
        <div className="row"><span className="seal">{s.evidence_level}</span>{(s.frontmatter.themes || []).map((t: string) => <span key={t} className="seal qing">{t}</span>)}</div>
      </header>
      <Player story={s} />
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

function Player({ story }: { story: Story }) {
  const acts = story.acts.slice(0, 6);
  const symbols = story.mode === "symbols";
  const sad = SAD_STORIES.has(story.id);
  const sadAct = acts.length === 4 ? 2 : -1;
  const charFor = (i: number) => (symbols ? acts[i].label.replace(/[^\u4e00-\u9fff]/g, "").slice(-2, -1) || acts[i].label[0]
    : acts.length === 4 ? ACT_CHAR[i] : CN_NUM[i + 1]);
  const { express, openChat } = useAgent();
  const [flipped, setFlipped] = useState<boolean[]>(() => acts.map(() => false));
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
  const allFlipped = flipped.every(Boolean);
  const nextIdx = flipped.findIndex((f) => !f);

  useEffect(() => { setFlipped(acts.map(() => false)); setStage("acts"); setOrder([]); setQi(0); setQPicked(null); setScore(0); }, [story.id]);

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

  function flip(i: number) {
    if (flipped[i] || i !== nextIdx) {
      if (!flipped[i]) express("encourage", 1800);
      return;
    }
    setFlipped((f) => f.map((v, k) => (k === i ? true : v)));
    if (i === sadAct && sad) express("sad", 5000);
    else if (i === acts.length - 1) express(sad ? "encourage" : "happy", 3500);
    else express("thinking", 1600);
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
    <section className="player container">
      <div className="player-steps">
        {(symbols ? ["认识符号", "认一认批校", "看懂校勘"] : ["翻开线索", "排列先后", "史实揭晓"]).map((t, i) => (
          <span key={t} className={["acts", "order", "reveal"].indexOf(stage) >= i ? "on" : ""}><b>{i + 1}</b>{t}</span>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {stage === "acts" && (
          <motion.div key="acts" exit={{ opacity: 0, y: -20 }}>
            <p className="player-hint">{allFlipped ? `${acts.length} 张${symbols ? "符号卡" : "线索"}都翻开了。` : `按顺序点击，翻开第 ${nextIdx + 1} 张${symbols ? "符号卡：傅增湘用朱笔这样标记" : "线索卡"}。`}</p>
            <div className="act-row" style={{ gridTemplateColumns: acts.length > 4 ? `repeat(${Math.min(acts.length, 5)}, 1fr)` : undefined }}>
              {acts.map((a, i) => (
                <motion.div key={i} className={`act-card ${flipped[i] ? "flipped" : ""} ${i === nextIdx ? "next" : ""} ${sad && i === sadAct ? "sad" : ""} ${symbols ? "symbol" : ""}`}
                  onClick={() => flip(i)} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 * i, duration: 0.7 }}>
                  <div className="act-inner">
                    <div className="act-front">
                      <span className="act-char brush">{charFor(i)}</span>
                      <span className="act-label">{a.label}</span>
                      {i === nextIdx && <span className="act-tap">点击翻开</span>}
                    </div>
                    <div className="act-back">
                      <span className="act-char-sm brush">{charFor(i)}</span>
                      {symbols && a.images?.[0] && <img className="act-img" src={kbAsset(`images/thumbs/${a.images[0]}.jpg`)} alt={a.label} />}
                      <Markdown text={a.text} titles={story.link_titles} />
                      {a.source && a.source !== "—" && <div className="act-src"><Markdown text={`出处：${a.source}`} titles={story.link_titles} /></div>}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="center" style={{ marginTop: 28 }}>
              <button className="btn solid" disabled={!allFlipped} onClick={() => { setStage("order"); express("thinking", 2000); }}>
                {symbols ? "下一步：认一认真实批校 →" : "下一步：排一排先后 →"}
              </button>
            </div>
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
              <button className="btn" onClick={() => { setStage("acts"); setOrder([]); }}>再看一遍</button>
              <button className="btn zhu" onClick={() => openChat(`关于“${story.title}”，原始材料是怎么记载的？`)}>问小傅：依据是什么？</button>
              <Link className="btn solid" to="/cases">去史料侦探 →</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
