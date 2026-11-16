import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { ErrorNote, Loading, PageHeader, Reveal } from "../components/ui";
import { api, type Case, type CaseCard } from "../lib/api";
import { useAgent, usePageAgent } from "../lib/store";

const LETTERS = "ABCDEFGH";
type Mark = "support" | "refute" | "unknown";
const MARK_LABEL: Record<Mark, string> = { support: "支持", refute: "反驳", unknown: "尚不能判断" };

export function Cases() {
  const [list, setList] = useState<CaseCard[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => { api<CaseCard[]>("/cases").then(setList).catch((e) => setErr(e.message)); }, []);
  usePageAgent({ tip: "每一案都有至少两种看似成立的解释。先下判断，再翻证据——随时可以改主意。", questions: ["什么是“研究者推断”和“原始材料明载”？", "藏园外库书的册数为什么对不上？"] });
  return (
    <div className="page cases">
      <PageHeader eyebrow="史料侦探" title="同一件事，为何有不同说法" lead={<p>排时间、比版本、追来源、核口径、重建流转。故事让你看“后来发生了什么”，侦探让你检查“我们凭什么这样说”。</p>} />
      {err && <ErrorNote msg={err} />}
      <section className="container">
        {!list.length && !err && <Loading h={360} />}
        <div className="case-grid">
          {list.map((c, i) => (
            <Reveal key={c.id} delay={i * 0.08}>
              <Link to={`/cases/${encodeURIComponent(c.id)}`} className="dossier">
                <span className="dossier-tab">卷宗 {String(c.rank).padStart(2, "0")}</span>
                <span className={`dossier-status seal ${c.case_status === "resolved" ? "solid" : "gold"}`}>{c.case_status === "resolved" ? "已有结论" : "仍待查证"}</span>
                <h3>{c.title}</h3>
                <p>{c.question}</p>
                <ol className="dossier-hyp">{c.hypotheses.map((h, k) => <li key={k}><b>{LETTERS[k]}</b>{h}</li>)}</ol>
                <span className="dossier-go">开始推理 →</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}

function hypothesisKey(h: string) {
  return (h.split(/[：:]/)[0] || h).replace(/\s/g, "").slice(0, 12);
}

/** Which hypothesis the researchers' conclusion supports: the wiki's `supported_hypothesis`, else an exact key match. */
function supportedHypothesis(c: Case) {
  const v = c.frontmatter.supported_hypothesis;
  if (typeof v === "number") return v;
  const norm = (c.conclusion || "").replace(/\s/g, "");
  return c.hypotheses.findIndex((h) => norm.includes(hypothesisKey(h)));
}

export function CaseDetail() {
  const { id = "" } = useParams();
  const [c, setC] = useState<Case | null>(null);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState<number | null>(null);
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [revealed, setRevealed] = useState(false);
  const { express, openChat } = useAgent();

  useEffect(() => {
    setC(null); setPick(null); setOpened(new Set()); setMarks({}); setRevealed(false);
    api<Case>(`/cases/${encodeURIComponent(id)}`).then(setC).catch((e) => setErr(e.message));
  }, [id]);
  usePageAgent(c ? { id: c.id, title: c.title, tip: "先在上面选一个你觉得更可能的解释，然后逐张翻开证据卡。", questions: [`“${c.title}”的关键证据是哪一条？`] } : {}, [c?.id]);

  if (err) return <div className="page"><ErrorNote msg={err} /></div>;
  if (!c) return <div className="page container"><Loading h={500} /></div>;

  const isNumbers = c.card_headers[0] === "数字";
  const supported = supportedHypothesis(c);
  const allOpen = opened.size >= c.cards.length;

  function open(i: number) {
    if (pick === null) { express("encourage", 2200); return; }
    setOpened((s) => new Set(s).add(i));
    express("thinking", 1500);
  }
  function reveal() {
    setRevealed(true);
    express(supported === pick ? "happy" : "encourage", 5000);
    setTimeout(() => document.getElementById("verdict")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  }

  return (
    <div className="page case-detail">
      <header className="container case-head">
        <Link to="/cases" className="muted small">← 史料侦探</Link>
        <span className="eyebrow">卷宗 · {c.case_status === "resolved" ? "已有结论" : "仍待查证"}</span>
        <h1 className="page-title">{c.title}</h1>
        <p className="page-lead">{c.question}</p>
      </header>

      <section className="container case-step">
        <div className="step-title"><b>1</b>你的初步判断</div>
        <div className="hyp-grid">
          {c.hypotheses.map((h, i) => (
            <motion.button key={i} className={`hyp ${pick === i ? "picked" : ""} ${revealed && supported === i ? "truth" : ""}`}
              whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}
              onClick={() => { setPick(i); express("encourage", 1600); }}>
              <span className="hyp-letter brush">{LETTERS[i]}</span>
              <span>{h}</span>
              {pick === i && <motion.span layoutId="pick" className="hyp-mark">我的判断</motion.span>}
            </motion.button>
          ))}
        </div>
        {c.hypothesis_text && <details className="hyp-more"><summary>展开两种解释的依据</summary><Markdown text={c.hypothesis_text} titles={c.link_titles} /></details>}
      </section>

      <section className="container case-step">
        <div className="step-title"><b>2</b>{isNumbers ? "数字卡：给每个数字标注时点与范围" : "证据卡：逐张翻开，标注它对你的判断意味着什么"}</div>
        {pick === null && <p className="player-hint">先在上一步选择一个判断，证据卡才会解锁。</p>}
        <div className="evidence-grid">
          {c.cards.map((card, i) => {
            const isOpen = opened.has(i);
            return (
              <motion.div key={i} className={`evidence ${isOpen ? "open" : ""} ${pick === null ? "locked" : ""}`} layout
                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}>
                {!isOpen ? (
                  <button className="evidence-cover" onClick={() => open(i)}>
                    <span className="brush">{isNumbers ? card[0] : `证据 ${card[0] || LETTERS[i]}`}</span>
                    <span className="muted small">{pick === null ? "🔒 待解锁" : "点击翻开"}</span>
                  </button>
                ) : (
                  <motion.div className="evidence-body" initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
                    {isNumbers ? (
                      <>
                        <div className="num-big brush">{card[0]}</div>
                        <p><b>时点</b> {card[1]}</p>
                        <p><b>范围</b> {card[2]}</p>
                        <div className="act-src"><Markdown text={`出处：${card[3] || ""}`} titles={c.link_titles} /></div>
                      </>
                    ) : (
                      <>
                        <span className="seal">{`证据 ${card[0]}`}</span>
                        <Markdown text={card[1] || ""} titles={c.link_titles} />
                        {card[2] && <div className="act-src"><Markdown text={`${c.card_headers[2] === "支持" ? "提示" : "出处"}：${card[2]}`} titles={c.link_titles} /></div>}
                      </>
                    )}
                    {!isNumbers && (
                      <div className="mark-row">
                        {(Object.keys(MARK_LABEL) as Mark[]).map((m) => (
                          <button key={m} className={`mark ${m} ${marks[i] === m ? "on" : ""}`} onClick={() => setMarks((s) => ({ ...s, [i]: m }))}>{MARK_LABEL[m]}</button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
        <div className="center" style={{ marginTop: 24 }}>
          <button className="btn solid" disabled={pick === null || !allOpen} onClick={reveal}>{allOpen ? "查看证据链与结论" : `还有 ${c.cards.length - opened.size} 张证据未翻开`}</button>
        </div>
      </section>

      <AnimatePresence>
        {revealed && (
          <motion.section id="verdict" className="container case-step verdict" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <div className="step-title"><b>3</b>证据链与结论</div>
            <div className="verdict-card card paper-card">
              <motion.div className="reveal-stamp" initial={{ scale: 2.2, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: -8 }} transition={{ type: "spring", stiffness: 300, damping: 14 }}>
                {c.case_status === "resolved" ? "结案" : "待查"}
              </motion.div>
              {pick !== null && (
                <p className="verdict-you">
                  你最初选择了 <b>{LETTERS[pick]}</b>。
                  {supported >= 0 ? (supported === pick ? "和研究者的结论一致。" : `研究者的结论更支持 ${LETTERS[supported]}——旧说为什么看似合理，下面有解释。`) : "这一案目前只能部分推断，下面列出了研究者的意见。"}
                  {Object.keys(marks).length > 0 && <> 你标注了 {Object.values(marks).filter((m) => m === "support").length} 条支持、{Object.values(marks).filter((m) => m === "refute").length} 条反驳。</>}
                </p>
              )}
              <Markdown text={c.conclusion} titles={c.link_titles} />
              {c.why && <><h4>为什么旧说看似合理</h4><Markdown text={c.why} titles={c.link_titles} /></>}
              {c.hints && <><h4>推理提示</h4><Markdown text={c.hints} titles={c.link_titles} /></>}
              {c.pending && <><h4>仍待查证</h4><Markdown text={c.pending} titles={c.link_titles} /></>}
              <div className="row" style={{ marginTop: 18 }}>
                <button className="btn" onClick={() => { setRevealed(false); setPick(null); setOpened(new Set()); setMarks({}); window.scrollTo({ top: 0, behavior: "smooth" }); }}>重新推理</button>
                <button className="btn zhu" onClick={() => openChat(`“${c.title}”这一案还有哪些材料可以继续查？`)}>问小傅：还能查什么？</button>
                <Link className="btn small" to={`/wiki/${encodeURIComponent(c.id)}`}>卷宗原文</Link>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
