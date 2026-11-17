import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { TiltLink } from "../components/Tilt";
import { BackLink, ErrorNote, Loading, PageHeader, Reveal } from "../components/ui";
import { api, type Case, type CaseCard, type Evidence } from "../lib/api";
import { useAgent, usePageAgent } from "../lib/store";

const LETTERS = "ABCDEFGH";
const STEPS = [
  { n: 1, t: "读案情", d: "这件事是什么，为什么会有争议" },
  { n: 2, t: "读史料", d: "逐条看原文摘录和它说明了什么" },
  { n: 3, t: "下判断", d: "选出你认为更可信的解释" },
  { n: 4, t: "对答案", d: "对照研究者的结论和理由" },
];

export function Cases() {
  const [list, setList] = useState<CaseCard[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => { api<CaseCard[]>("/cases").then(setList).catch((e) => setErr(e.message)); }, []);
  usePageAgent({ tip: "每一份卷宗都是一个真实的史料疑问：先读史料，再在两种解释之间下判断，最后对照研究者的结论。", questions: ["什么是“研究者推断”和“原始材料明载”？", "藏园外库书的册数为什么对不上？"] });
  return (
    <div className="page cases">
      <PageHeader eyebrow="史料侦探" title="同一件事，为何有不同说法"
        lead={<p>每份卷宗先给你案情和几条原始史料，读完再判断哪种解释更可信，最后对照研究者的考证。故事告诉你“后来发生了什么”，侦探带你检查“我们凭什么这样说”。</p>} />
      <section className="container">
        <ol className="case-howto">
          {STEPS.map((s) => <li key={s.n}><b>{s.n}</b><span>{s.t}</span><small>{s.d}</small></li>)}
        </ol>
        {err && <ErrorNote msg={err} />}
        {!list.length && !err && <Loading h={360} />}
        <div className="case-grid">
          {list.map((c, i) => (
            <Reveal key={c.id} delay={i * 0.08}>
              <TiltLink to={`/cases/${encodeURIComponent(c.id)}`} className="dossier" max={5}>
                <span className="dossier-tab">卷宗 {String(c.rank).padStart(2, "0")}</span>
                <h3>{c.title}</h3>
                <p>{c.question}</p>
                <ol className="dossier-hyp">{c.hypotheses.map((h, k) => <li key={k}><b>{LETTERS[k]}</b>{h}</li>)}</ol>
                <span className="dossier-go">打开卷宗 →</span>
              </TiltLink>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Which hypothesis the researchers' conclusion supports (wiki frontmatter `supported_hypothesis`, 0-based). */
function supportedHypothesis(c: Case) {
  const v = c.frontmatter.supported_hypothesis;
  return typeof v === "number" ? v : -1;
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  const lenis = (window as any).__lenis;
  if (el && lenis) lenis.scrollTo(el, { offset: -90, duration: 1.1 }); else el?.scrollIntoView({ behavior: "smooth" });
}

export function CaseDetail() {
  const { id = "" } = useParams();
  const [c, setC] = useState<Case | null>(null);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState<number | null>(null);
  const [tags, setTags] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState(false);
  const [read, setRead] = useState(false);
  const judgeRef = useRef<HTMLElement>(null);
  const { express, openChat } = useAgent();

  useEffect(() => {
    setC(null); setPick(null); setTags({}); setRevealed(false); setRead(false);
    api<Case>(`/cases/${encodeURIComponent(id)}`).then(setC).catch((e) => setErr(e.message));
  }, [id]);
  usePageAgent(c ? { id: c.id, title: c.title, tip: "从上往下读：先看案情，再读每一条史料，读完到第三步做判断。", questions: [`“${c.title}”的关键史料是哪一条？`] } : {}, [c?.id]);

  if (err) return <div className="page"><ErrorNote msg={err} /></div>;
  if (!c) return <div className="page container"><Loading h={500} /></div>;

  const supported = supportedHypothesis(c);
  const label = (i: number) => `${LETTERS[i]} · ${c.labels[i] || c.hypotheses[i]}`;
  const step = revealed ? 4 : pick !== null ? 3 : read ? 3 : 2;
  function reveal() {
    setRevealed(true);
    express(supported === pick ? "happy" : "encourage", 5000);
    setTimeout(() => scrollToId("verdict"), 120);
  }
  const agree = c.evidence.filter((e, i) => tags[i] !== undefined && e.points && LETTERS.indexOf(e.points) === tags[i]).length;

  return (
    <div className="page case-detail">
      <header className="container case-head">
        <BackLink fallback="/cases" label="史料侦探" />
        <span className="eyebrow">卷宗 · {c.case_status === "resolved" ? "研究者已有结论" : "仍有待查证之处"}</span>
        <h1 className="page-title">{c.title}</h1>
        <p className="page-lead">{c.question}</p>
        <ol className="case-howto compact">
          {STEPS.map((s) => <li key={s.n} className={step >= s.n ? "on" : ""}><b>{s.n}</b><span>{s.t}</span></li>)}
        </ol>
      </header>

      <section className="container case-step">
        <div className="step-title"><b>1</b>案情</div>
        <div className="case-brief card">
          {c.background ? <Markdown text={c.background} titles={c.link_titles} /> : <p>{c.question}</p>}
          <div className="case-hyps-preview">
            <span className="muted small">目前有两种解释：</span>
            {c.hypotheses.map((h, i) => <p key={i}><b>{LETTERS[i]}</b>{h}</p>)}
          </div>
        </div>
      </section>

      <section className="container case-step">
        <div className="step-title"><b>2</b>{c.numbers ? "史料：同一批书的几个数字" : "史料：逐条读原文"}</div>
        <p className="player-hint left">{c.numbers ? "每个数字都标出了统计的时点和范围。先别急着判断，看看它们是不是在数同一样东西。" : "每张卡片上是史料的原文摘录、它说明了什么，以及出处（点开可读原文全段）。读完再往下做判断。"}</p>
        <div className={`evidence-list ${c.numbers ? "numbers" : ""}`}>
          {c.evidence.map((e, i) => <EvidenceCard key={i} e={e} i={i} numbers={c.numbers} titles={c.link_titles} />)}
        </div>
        {!read && pick === null && (
          <div className="center" style={{ marginTop: 20 }}>
            <button className="btn solid" onClick={() => { setRead(true); express("thinking", 1500); requestAnimationFrame(() => judgeRef.current && scrollToId("judge")); }}>史料读完了，去下判断 ↓</button>
          </div>
        )}
      </section>

      <section className="container case-step" id="judge" ref={judgeRef}>
        <div className="step-title"><b>3</b>你的判断</div>
        <p className="player-hint left">根据上面的史料，你认为哪种解释更可信？</p>
        <div className="hyp-grid">
          {c.hypotheses.map((h, i) => (
            <motion.button key={i} className={`hyp ${pick === i ? "picked" : ""} ${revealed && supported === i ? "truth" : ""}`}
              whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }} onClick={() => { setPick(i); express("encourage", 1600); }}>
              <span className="hyp-letter brush">{LETTERS[i]}</span>
              <span>{h}</span>
              {pick === i && <motion.span layoutId="pick" className="hyp-mark">我的判断</motion.span>}
            </motion.button>
          ))}
        </div>
        {!c.numbers && c.evidence.some((e) => e.points) && (
          <div className="tag-table">
            <p className="muted small">可选：给每条史料标一标，它更支持哪一种解释？</p>
            {c.evidence.map((e, i) => (
              <div key={i} className="tag-row">
                <span className="tag-key">史料 {e.key || LETTERS[i]}</span>
                <span className="tag-text">{shorten(e.text || e.quote)}</span>
                <span className="tag-opts">
                  {c.hypotheses.map((_, k) => (
                    <button key={k} className={`mark ${tags[i] === k ? "on" : ""}`} onClick={() => setTags((s) => ({ ...s, [i]: k }))}>更支持 {LETTERS[k]}</button>
                  ))}
                  <button className={`mark neutral ${tags[i] === -1 ? "on" : ""}`} onClick={() => setTags((s) => ({ ...s, [i]: -1 }))}>都不直接支持</button>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="center" style={{ marginTop: 24 }}>
          <button className="btn solid" disabled={pick === null} onClick={reveal}>{pick === null ? "先选择一种解释" : "对照研究者的结论 →"}</button>
        </div>
      </section>

      <AnimatePresence>
        {revealed && (
          <motion.section id="verdict" className="container case-step verdict" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <div className="step-title"><b>4</b>研究者的结论</div>
            <div className="verdict-card card paper-card">
              <motion.div className="reveal-stamp" initial={{ scale: 2.2, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: -8 }} transition={{ type: "spring", stiffness: 300, damping: 14 }}>
                {c.case_status === "resolved" ? "结案" : "待查"}
              </motion.div>
              {pick !== null && (
                <p className="verdict-you">
                  你选择了 <b>{label(pick)}</b>。
                  {supported >= 0 ? (supported === pick ? "和研究者的结论一致。" : `研究者的结论更支持 ${label(supported)}——下面解释了另一种说法为什么看似合理。`) : "这一案目前只能部分推断，下面列出了研究者的意见。"}
                  {Object.keys(tags).length > 0 && <> 你标注的 {Object.keys(tags).length} 条史料中，有 {agree} 条与研究者的解读相同。</>}
                </p>
              )}
              <Markdown text={c.conclusion} titles={c.link_titles} />
              {!c.numbers && c.evidence.some((e) => e.reading) && (
                <>
                  <h4>每条史料，研究者怎么看</h4>
                  <ul className="reading-list">
                    {c.evidence.map((e, i) => {
                      const p = LETTERS.indexOf(e.points);
                      return (
                        <li key={i}>
                          <b>史料 {e.key || LETTERS[i]}</b>
                          {p >= 0 ? <span className="seal solid">支持 {LETTERS[p]}</span> : <span className="seal gold">不直接支持任何一说</span>}
                          {tags[i] !== undefined && <span className={`your-tag ${tags[i] === p ? "same" : ""}`}>你标的：{tags[i] >= 0 ? `支持 ${LETTERS[tags[i]]}` : "都不直接支持"}</span>}
                          <Markdown text={e.reading} titles={c.link_titles} />
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              {c.why && <><h4>另一种说法为什么看似合理</h4><Markdown text={c.why} titles={c.link_titles} /></>}
              {c.hints && <><h4>推理提示</h4><Markdown text={c.hints} titles={c.link_titles} /></>}
              {c.open_questions && <><h4>仍待查证</h4><Markdown text={c.open_questions} titles={c.link_titles} /></>}
              <div className="row" style={{ marginTop: 18 }}>
                <button className="btn" onClick={() => { setRevealed(false); setPick(null); setTags({}); setRead(false); scrollToId("judge"); }}>重新判断</button>
                <button className="btn zhu" onClick={() => openChat(`“${c.title}”这一案还有哪些材料可以继续查？`)}>问小傅：还能查什么？</button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function shorten(s: string) {
  const t = s.replace(/\[\[[^\]]*\]\]/g, "").replace(/\*\*/g, "");
  return t.length > 40 ? t.slice(0, 38) + "…" : t;
}

function EvidenceCard({ e, i, numbers, titles }: { e: Evidence; i: number; numbers: boolean; titles: Record<string, string> }) {
  return (
    <Reveal className={`evidence-card ${numbers ? "num" : ""}`} delay={(i % 4) * 0.06}>
      {numbers ? (
        <>
          <div className="num-big brush">{e.key}</div>
          <p><b>时点</b>{e.when}</p>
          <p><b>范围</b>{e.scope}</p>
        </>
      ) : (
        <>
          <span className="evidence-key brush">{e.key || LETTERS[i]}</span>
          {e.quote && <blockquote className="evidence-quote"><Markdown text={e.quote} titles={titles} /></blockquote>}
          {e.text && <div className="evidence-text"><b>说明了什么</b><Markdown text={e.text} titles={titles} /></div>}
        </>
      )}
      {e.source && <Markdown className="evidence-src" text={`出处：${e.source}`} titles={titles} />}
    </Reveal>
  );
}
