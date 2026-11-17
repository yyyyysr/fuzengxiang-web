import { AnimatePresence, motion } from "framer-motion";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { TiltLink } from "../components/Tilt";
import { CloudDivider, ErrorNote, Loading, PageHeader, Reveal, SplitText } from "../components/ui";
import { api, kbAsset, stripLinks, type Act, type Story, type StoryCard, type Tale } from "../lib/api";
import { artUrl, STORY_ART } from "../lib/scenes";
import { useAgent, usePageAgent } from "../lib/store";
import { StoryCinema } from "./StoryCinema";

const SAD_STORIES = new Set(["乐府诗集避火", "水灾运书", "东坡和陶诗失窃", "海源阁遗书散出", "永乐大典六册"]);
export const CN_NUM = "〇一二三四五六七八九十";

export function Stories() {
  const [list, setList] = useState<StoryCard[]>([]);
  const [tales, setTales] = useState<Tale[]>([]);
  const [reading, setReading] = useState<Tale | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<StoryCard[]>("/stories").then(setList).catch((e) => setErr(e.message));
    api<Tale[]>("/tales").then(setTales).catch(() => {});
  }, []);
  usePageAgent({ tip: "十个重点故事，每个都是一场一分钟的放映；往下还有更多用白话讲的藏园小故事。", questions: ["哪个故事最适合第一次来的读者？", "《永乐大典》六册最后去了哪里？"] });
  return (
    <div className="page stories">
      <PageHeader eyebrow="藏园故事" title="一件与书有关的事，后来怎样了" lead={<p>访书、护书、校书、影印、公藏——十个有材料支撑的故事逐幕放映，放映完可以读完整的故事和出处。</p>} />
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
                  </div>
                  <span className="story-go">▶ 放映</span>
                </TiltLink>
              </Reveal>
            );
          })}
        </div>
      </section>
      {!!tales.length && (
        <section className="container section">
          <Reveal className="center">
            <span className="eyebrow">白话藏园</span>
            <h2 className="section-title brush"><SplitText text="更多藏园小故事" inView /></h2>
            <CloudDivider />
            <p className="muted center-text">依据史料用白话讲述，文中出现的人物附有简介，每段都能点开出处。</p>
          </Reveal>
          <div className="tale-grid">
            {tales.map((t, i) => (
              <Reveal key={t.id} delay={(i % 3) * 0.06}>
                <button className="tale-card" onClick={() => setReading(t)}>
                  <span className="tale-year brush">{t.date.slice(0, 4)}</span>
                  <h3>{t.title}</h3>
                  {t.event !== t.title && <span className="tale-event">{t.event}</span>}
                  <p>{t.teaser}</p>
                  <span className="tale-go">读故事 →</span>
                </button>
              </Reveal>
            ))}
          </div>
        </section>
      )}
      <AnimatePresence>{reading && <TaleReader tale={reading} onClose={() => setReading(null)} />}</AnimatePresence>
    </div>
  );
}

function TaleReader({ tale, onClose }: { tale: Tale; onClose: () => void }) {
  const { openChat, express } = useAgent();
  useEffect(() => {
    express("happy", 2000);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tale.id, express, onClose]);
  return (
    <motion.div className="modal-mask" data-scroll-trap initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.article className="tale-reader" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }} onClick={(e) => e.stopPropagation()}>
        <button className="drawer-close" onClick={onClose} aria-label="关闭">×</button>
        <span className="eyebrow">{tale.date}{tale.event !== tale.title ? ` · ${tale.event}` : ""}</span>
        <h2 className="tale-title">{tale.title}</h2>
        <Markdown text={tale.story} titles={tale.link_titles} className="tale-md" />
        {tale.people && (
          <div className="tale-people">
            <h4>文中人物</h4>
            <Markdown text={tale.people} titles={tale.link_titles} />
          </div>
        )}
        <div className="row" style={{ marginTop: 18 }}>
          <Link className="btn small" to={`/wiki/${encodeURIComponent(tale.id)}`}>知识页与出处</Link>
          <button className="btn small zhu" onClick={() => openChat(`请讲讲：${tale.title}（${tale.date}）`)}>问小傅</button>
        </div>
      </motion.article>
    </motion.div>
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
    tip: "", // the cinema shows 小傅's own per-act guide line
    questions: [`${s.title}——这件事的原始依据是什么？`, `${s.title}里出现的人物都是谁？`],
  } : {}, [s?.id]);
  const textRef = useRef<HTMLElement>(null);
  if (err) return <div className="page"><ErrorNote msg={err} /></div>;
  if (!s) return <div className="page container"><Loading h={500} /></div>;
  const idx = all.findIndex((x) => x.id === s.id);
  const next = all[(idx + 1) % (all.length || 1)];
  return (
    <div className="page story-detail">
      <Player story={s} rankLabel={CN_NUM[s.rank] || String(s.rank)} textRef={textRef} />
      {!!s.images?.length && (
        <section className="container section-sm">
          <Reveal><span className="eyebrow">真实材料</span><h2 className="section-title brush"><SplitText text="批校原件局部" inView /></h2></Reveal>
          <div className="story-images">
            {s.images.map((im) => (
              <Reveal key={im.id} className="story-img"><img src={kbAsset(im.thumb)} alt={im.title} loading="lazy" /><span>{im.title}</span></Reveal>
            ))}
          </div>
        </section>
      )}
      <StoryText ref={textRef} story={s} next={next && next.id !== s.id ? next : undefined} />
    </div>
  );
}

const StoryText = forwardRef<HTMLElement, { story: Story; next?: StoryCard }>(function StoryText({ story, next }, ref) {
  const { openChat } = useAgent();
  const symbols = story.mode === "symbols";
  return (
    <section ref={ref} className="container section-sm story-text" id="story-text">
      <Reveal className="center">
        <span className="eyebrow">{symbols ? "校勘方法" : "故事全文"}</span>
        <h2 className="section-title brush"><SplitText text={story.title} inView stagger={0.04} /></h2>
        <CloudDivider />
      </Reveal>
      <div className="story-text-grid">
        <div className="story-acts">
          {story.one_liner && <p className="story-gist">{stripLinks(story.one_liner)}</p>}
          {story.full_text && <Reveal className="story-full"><Markdown text={story.full_text} titles={story.link_titles} className="tale-md" /></Reveal>}
          {!story.full_text && story.acts.map((a, i) => (
            <Reveal key={i} className="story-act" delay={i * 0.05}>
              <span className="story-act-no brush">{CN_NUM[i + 1]}</span>
              <div>
                <h3>{symbols ? a.label : `第${CN_NUM[i + 1]}幕 · ${a.label}`}</h3>
                <Markdown text={a.text} titles={story.link_titles} />
                {a.source && a.source !== "—" && <Markdown className="story-act-src" text={`出处：${a.source}`} titles={story.link_titles} />}
              </div>
            </Reveal>
          ))}
        </div>
        <aside className="story-aside">
          {story.people_notes && (
            <div className="card side-card">
              <h4>故事里的人</h4>
              <Markdown text={story.people_notes} titles={story.link_titles} />
            </div>
          )}
          {story.notes && (
            <div className="card side-card">
              <h4>史料小注</h4>
              <Markdown text={story.notes} titles={story.link_titles} />
            </div>
          )}
          <div className="row">
            <button className="btn small zhu" onClick={() => openChat(`关于“${story.title}”，原始材料是怎么记载的？`)}>问小傅：依据是什么？</button>
            <Link className="btn small" to={`/wiki/${encodeURIComponent(story.id)}`}>知识页全文</Link>
            {next && <Link className="btn small solid" to={`/stories/${encodeURIComponent(next.id)}`}>下一个故事：{next.title.slice(0, 12)} →</Link>}
          </div>
        </aside>
      </div>
    </section>
  );
});

function scrollToEl(el: HTMLElement | null) {
  if (!el) return;
  const lenis = (window as any).__lenis;
  if (lenis) lenis.scrollTo(el, { offset: -84, duration: 1.2 });
  else el.scrollIntoView({ behavior: "smooth" });
}

function Player({ story, rankLabel, textRef }: { story: Story; rankLabel: string; textRef: React.RefObject<HTMLElement> }) {
  const acts = story.acts.slice(0, 6);
  const symbols = story.mode === "symbols";
  const sad = SAD_STORIES.has(story.id);
  const sadAct = acts.length === 4 ? 2 : -1;
  const seal = symbols ? (i: number) => acts[i].label.replace(/[^\u4e00-\u9fff]/g, "").slice(-2, -1) || acts[i].label[0] : undefined;
  const { express } = useAgent();
  const quizRef = useRef<HTMLElement>(null);
  function finish() {
    express(sad ? "encourage" : "happy", 2500);
    requestAnimationFrame(() => scrollToEl(symbols ? quizRef.current : textRef.current));
  }
  if (!acts.length) return null;
  return (
    <>
      <StoryCinema story={story} acts={acts} rankLabel={rankLabel} seal={seal} sadAct={sadAct} sad={sad} onFinish={finish}
        finishLabel={symbols ? "认一认真实批校 ↓" : "读完整故事 ↓"} />
      {symbols && <SymbolQuiz ref={quizRef} story={story} acts={acts} seal={seal!} onDone={() => scrollToEl(textRef.current)} />}
    </>
  );
}

/** 校一页通典: match real collation marks (cropped from the annotated Tongdian) to the symbol they use. */
const SymbolQuiz = forwardRef<HTMLElement, { story: Story; acts: Act[]; seal: (i: number) => string; onDone: () => void }>(
  function SymbolQuiz({ story, acts, seal, onDone }, ref) {
    const { express } = useAgent();
    const quiz = useMemo(() => acts.flatMap((a, i) => (a.images || []).map((img) => ({ img, answer: i })))
      .sort((x, y) => ((x.img.charCodeAt(8) * 37) % 11) - ((y.img.charCodeAt(8) * 37) % 11)), [story.id]); // eslint-disable-line react-hooks/exhaustive-deps
    const [qi, setQi] = useState(0);
    const [picked, setPicked] = useState<number | null>(null);
    const [score, setScore] = useState(0);
    const done = qi >= quiz.length;
    function answer(i: number) {
      if (picked !== null) return;
      setPicked(i);
      const ok = i === quiz[qi].answer;
      if (ok) setScore((s) => s + 1);
      express(ok ? "happy" : "encourage", 1800);
      window.setTimeout(() => { setPicked(null); setQi(qi + 1); }, ok ? 900 : 1700);
    }
    if (!quiz.length) return null;
    return (
      <section className="player container" ref={ref}>
        <AnimatePresence mode="wait">
          {!done ? (
            <motion.div key={`quiz-${qi}`} className="quiz" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
              <p className="player-hint">第 {qi + 1} / {quiz.length} 张批校局部：这里用的是哪一种校勘符号？</p>
              <div className="quiz-body">
                <img src={kbAsset(`images/thumbs/${quiz[qi].img}.jpg`)} alt="批校局部" />
                <div className="quiz-options">
                  {acts.map((a, i) => {
                    const state = picked === null ? "" : i === quiz[qi].answer ? "right" : i === picked ? "wrong" : "";
                    return <button key={i} className={`pool-card ${state}`} onClick={() => answer(i)}><b className="brush">{seal(i)}</b> {a.label}</button>;
                  })}
                </div>
              </div>
              <p className="muted small center">图片来源：刘毅超文配图（傅增湘校明本《通典》）。已认对 {score} 张。</p>
            </motion.div>
          ) : (
            <motion.div key="done" className="center quiz-done" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <p className="reveal-text">{quiz.length} 张批校局部，你认对了 {score} 张。</p>
              <p className="muted small">提醒：宋本与明本文字不同，并不自动等于宋本正确——校勘要据证据判断。</p>
              <div className="row center-row">
                <button className="btn" onClick={() => { setQi(0); setScore(0); }}>再认一遍</button>
                <button className="btn solid" onClick={onDone}>读校勘方法全文 ↓</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    );
  });
