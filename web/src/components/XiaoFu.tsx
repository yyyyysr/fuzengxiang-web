import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import { api, postJSON, routeFor, streamChat, type ChatSource } from "../lib/api";
import { useAgent, useSource, type Emotion } from "../lib/store";

const EMO_LABEL: Record<Emotion, string> = {
  idle: "发呆", thinking: "思考中", encourage: "鼓励", happy: "开心", sad: "难过", sleep: "打盹",
};
const DEFAULT_QS = ["“双鉴楼”这个名字是怎么来的？", "傅增湘和张元济因为哪些书打过交道？", "《乐府诗集》失火那天书在哪里？", "傅增湘一生校了多少书？"];

type Msg = { role: "user" | "assistant"; content: string; sources?: ChatSource[]; mode?: string; pending?: boolean };
type LLMConf = { configured: boolean; base_url: string; model: string; api_key: string };

export function Avatar({ emotion, size = 120, className = "" }: { emotion: Emotion; size?: number; className?: string }) {
  return (
    <div className={`avatar ${className}`} style={{ width: size, height: size }}>
      <AnimatePresence mode="popLayout">
        <motion.img
          key={emotion}
          src={`/xiaofu/${emotion}.webp`}
          alt={`小傅（${EMO_LABEL[emotion]}）`}
          initial={{ opacity: 0, scale: 0.86, rotate: -4 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          draggable={false}
        />
      </AnimatePresence>
    </div>
  );
}

export function XiaoFu() {
  const agent = useAgent();
  const { emotion, express, page, chatOpen, openChat, closeChat, hidden, setHidden } = agent;
  const [bubble, setBubble] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [conf, setConf] = useState<LLMConf | null>(null);
  const abort = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { api<LLMConf>("/llm/config").then(setConf).catch(() => {}); }, []);

  // Contextual tip whenever the page changes.
  useEffect(() => {
    if (!page.tip || chatOpen) return;
    setBubble(page.tip);
    const t = window.setTimeout(() => setBubble(""), 9000);
    return () => window.clearTimeout(t);
  }, [page.tip, chatOpen]);

  useEffect(() => {
    if (!chatOpen) return;
    setBubble("");
    const q = agent.consumeQuestion();
    if (q) ask(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, agent.pendingQuestion]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  async function ask(question: string) {
    question = question.trim();
    if (!question || busy) return;
    setInput("");
    const history = msgs.filter((m) => !m.pending).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "", pending: true }]);
    setBusy(true);
    express("thinking", 0);
    abort.current = new AbortController();
    const patch = (f: (m: Msg) => Msg) => setMsgs((all) => all.map((m, i) => (i === all.length - 1 ? f(m) : m)));
    try {
      await streamChat(question, history, page.id, {
        onSources: (d) => patch((m) => ({ ...m, sources: d.sources })),
        onDelta: (t) => patch((m) => ({ ...m, content: m.content + t })),
        onDone: (d) => {
          patch((m) => ({ ...m, pending: false, mode: d.mode }));
          express(d.emotion as Emotion, 6000);
        },
      }, abort.current.signal);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        patch((m) => ({ ...m, pending: false, content: `抱歉，问答服务暂时连不上：${e.message || e}` }));
        express("sad", 4000);
      } else {
        patch((m) => ({ ...m, pending: false, content: m.content + "（已停止）" }));
        express("idle", 0);
      }
    } finally {
      setBusy(false);
    }
  }

  const questions = [...page.questions, ...DEFAULT_QS].slice(0, 4);

  if (hidden) {
    return (
      <button className="xf-restore" onClick={() => setHidden(false)} title="唤出小傅">
        <img src="/xiaofu/sleep.webp" alt="" /> 小傅
      </button>
    );
  }

  return (
    <>
      <div className="xf-dock">
        <AnimatePresence>
          {bubble && !chatOpen && (
            <motion.div className="xf-bubble" initial={{ opacity: 0, y: 12, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}>
              <button className="xf-bubble-x" onClick={() => setBubble("")} aria-label="关闭提示">×</button>
              <p>{bubble}</p>
              <button className="btn small zhu" onClick={() => openChat()}>问问小傅</button>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          className={`xf-avatar-btn ${emotion}`}
          onClick={() => (chatOpen ? closeChat() : openChat())}
          whileHover={{ scale: 1.06, rotate: -2 }} whileTap={{ scale: 0.95 }}
          aria-label="打开小傅问答"
        >
          <span className="xf-halo" />
          <Avatar emotion={emotion} size={112} className="float" />
          {emotion === "sleep" && <span className="xf-zzz">z z</span>}
        </motion.button>
      </div>

      <AnimatePresence>
        {chatOpen && (
          <motion.section
            className="xf-panel"
            initial={{ opacity: 0, y: 40, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 240, damping: 26 }}
            aria-label="小傅问答"
          >
            <header className="xf-head">
              <Avatar emotion={emotion} size={52} />
              <div className="xf-head-text">
                <strong>小傅 · 藏园导览</strong>
                <span className="muted small">
                  {EMO_LABEL[emotion]} · {conf?.configured ? `大模型 ${conf.model}` : "资料检索摘编模式"}
                  {page.title ? ` · 正在看《${page.title}》` : ""}
                </span>
              </div>
              <button className="xf-icon" title="大模型设置" onClick={() => setShowSettings((v) => !v)}>⚙</button>
              <button className="xf-icon" title="收起小傅" onClick={() => { closeChat(); setHidden(true); }}>－</button>
              <button className="xf-icon" title="关闭" onClick={closeChat}>×</button>
            </header>

            <AnimatePresence>
              {showSettings && <Settings conf={conf} onSaved={(c) => { setConf(c); setShowSettings(false); express(c.configured ? "happy" : "idle"); }} />}
            </AnimatePresence>

            <div className="xf-list" ref={listRef}>
              {msgs.length === 0 && (
                <div className="xf-welcome">
                  <p>你好，我是小傅，藏园的导览伙伴。我不是傅增湘本人，但可以陪你查资料：每个回答都会标出处，点 <span className="cite">1</span> 就能翻到原文。</p>
                </div>
              )}
              {msgs.map((m, i) => <Message key={i} m={m} />)}
            </div>

            <div className="xf-suggest">
              {questions.map((q) => <button key={q} className="chip" disabled={busy} onClick={() => ask(q)}>{q}</button>)}
            </div>
            <form className="xf-input" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
              <textarea
                value={input} rows={1} placeholder="问问人物、书名、年份……（Enter 发送）"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
              />
              {busy
                ? <button type="button" className="btn small" onClick={() => abort.current?.abort()}>停止</button>
                : <button type="submit" className="btn small solid" disabled={!input.trim()}>发送</button>}
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

function Message({ m }: { m: Msg }) {
  const nav = useNavigate();
  const src = useSource();
  const [open, setOpen] = useState(false);
  const go = (s: ChatSource) => (s.kind === "chunk" ? src.open(s.id, s.bid) : nav(routeFor(s.id, s.type)));
  const byN = new Map((m.sources || []).map((s) => [String(s.n), s]));
  const text = m.content.replace(/\[(\d{1,2})\]/g, (all, n) => (byN.has(n) ? `[${n}](cite:${n})` : all));

  if (m.role === "user") return <div className="msg user"><p>{m.content}</p></div>;
  return (
    <motion.div className="msg bot" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {m.pending && !m.content && <div className="typing"><i /><i /><i /> <span className="muted small">翻检资料中……</span></div>}
      <ReactMarkdown
        urlTransform={(u) => u}
        components={{
          a({ href = "", children }) {
            if (href.startsWith("cite:")) {
              const s = byN.get(href.slice(5));
              return <button className="cite" title={s?.title} onClick={() => s && go(s)}>{children}</button>;
            }
            return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
      {!!m.sources?.length && !m.pending && (
        <div className="msg-sources">
          <button className="msg-src-toggle" onClick={() => setOpen((v) => !v)}>
            {open ? "收起" : "查看"}依据 {m.sources.length} 条 {m.mode === "llm" ? "· 大模型生成" : "· 检索摘编"}
          </button>
          <AnimatePresence>
            {open && (
              <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                {m.sources.map((s) => (
                  <li key={s.n} onClick={() => go(s)}>
                    <span className="cite">{s.n}</span>
                    <span className={`seal ${s.kind === "wiki" ? "qing" : "gold"}`}>{s.kind === "wiki" ? "知识页" : "原文"}</span>
                    <span className="src-title">{s.title}</span>
                    {s.kind === "chunk" && s.authors?.length ? <span className="muted small"> · {s.authors.join("、")}</span> : null}
                  </li>
                ))}
              </motion.ol>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

function Settings({ conf, onSaved }: { conf: LLMConf | null; onSaved: (c: LLMConf) => void }) {
  const [key, setKey] = useState("");
  const [base, setBase] = useState(conf?.base_url || "");
  const [model, setModel] = useState(conf?.model || "");
  const [saving, setSaving] = useState(false);
  return (
    <motion.form
      className="xf-settings" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try { onSaved(await postJSON<LLMConf>("/llm/config", { api_key: key || undefined, base_url: base, model })); } finally { setSaving(false); }
      }}
    >
      <p className="small muted">接入任意 OpenAI 兼容接口（DeepSeek、通义千问、Kimi、GLM 等）。此处设置仅保存在服务端内存；长期使用请写入项目根目录 <code>.env</code> 的 <code>LLM_API_KEY / LLM_BASE_URL / LLM_MODEL</code>。</p>
      <label>接口地址<input value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://api.deepseek.com/v1" /></label>
      <label>模型<input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-chat" /></label>
      <label>API Key<input value={key} onChange={(e) => setKey(e.target.value)} type="password" placeholder={conf?.api_key ? `当前：${conf.api_key}` : "sk-..."} /></label>
      <div className="row">
        <button className="btn small solid" disabled={saving}>{saving ? "保存中…" : "保存"}</button>
        {conf?.configured && <button type="button" className="btn small" onClick={async () => onSaved(await postJSON<LLMConf>("/llm/config", { api_key: "" }))}>清除 Key</button>}
      </div>
    </motion.form>
  );
}
