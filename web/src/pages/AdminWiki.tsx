import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { PageHeader } from "../components/ui";
import { usePageAgent } from "../lib/store";

type Material = { ref: string; doc_id: string; bid: string; page: number | null; title: string; authors: string[]; cite: string; text: string };
type Entry = { id: string; title: string; type: string; path: string; time: string; action: string; docs: string[] };
type Status = { enabled: boolean; authorized: boolean; llm: { configured: boolean; model: string }; pages: number; documents: number;
  types: Record<string, string>; entries: Entry[]; note: string };
type Draft = { markdown: string; id: string; type: string; existing: string | null; warnings: string[]; materials: number; seconds: number; model: string };
type Upload = { name: string; title: string; author: string; text: string };
type Done = { id: string; url: string; path: string; docs: string[]; pages: number; mentions: number; embedded: number; seconds: number };

const TOKEN_KEY = "fzx-admin-token";
const EMPTY_UPLOAD: Upload = { name: "", title: "", author: "", text: "" };

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/admin${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": localStorage.getItem(TOKEN_KEY) || "" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || `请求失败（${r.status}）`);
  return data as T;
}

function splitFrontmatter(md: string): { fm: string; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  return m ? { fm: m[1], body: md.slice(m[0].length).replace(/^# .*\n/, "") } : { fm: "", body: md };
}

function readAsBase64(f: File): Promise<string> {
  return new Promise((ok, fail) => {
    const rd = new FileReader();
    rd.onload = () => ok(String(rd.result).split(",")[1] || "");
    rd.onerror = () => fail(rd.error);
    rd.readAsDataURL(f);
  });
}

export function AdminWiki() {
  usePageAgent({ tip: "这里是知识库后台：给一个词条名称，勾选资料或上传原文，大模型会整理成带出处的 wiki 页面。", questions: [] });
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const loadStatus = () => call<Status>("/status").then(setStatus).catch((e) => setErr(e.message));
  useEffect(() => { loadStatus(); }, []);

  if (!status) return <div className="page container admin">{err ? <div className="empty">{err}</div> : <div className="skeleton" style={{ height: 300 }} />}</div>;
  return (
    <div className="page admin">
      <PageHeader eyebrow="知识库后台 · wiki 补充" title="补充一个知识库词条"
        lead={<p>填写词条，勾选知识库里的原文段落或上传原始资料，由大模型（{status.llm.model}）按维护规范整理成带出处的 wiki 页面；确认后写入知识库并自动重建索引，网站各栏目和小傅随即可用。</p>} />
      <section className="container">
        {!status.enabled && <div className="admin-alert">后台未启用：服务器需要设置 ADMIN_TOKEN，且知识库目录包含 pipeline/kb/wiki.py。</div>}
        {status.enabled && !status.authorized && (
          <form className="admin-gate card" onSubmit={(e) => { e.preventDefault(); localStorage.setItem(TOKEN_KEY, token.trim()); setErr(""); loadStatus(); }}>
            <h3>输入管理口令</h3>
            <p className="muted small">口令由服务器的 ADMIN_TOKEN 设定，只保存在这台电脑的浏览器里。</p>
            <div className="row">
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="管理口令" autoFocus />
              <button className="btn solid" type="submit">进入后台</button>
            </div>
            {localStorage.getItem(TOKEN_KEY) && <p className="admin-error">口令不正确，请重新输入。</p>}
          </form>
        )}
        {status.enabled && status.authorized && <Workbench status={status} onCommitted={loadStatus} />}
      </section>
    </div>
  );
}

function Workbench({ status, onCommitted }: { status: Status; onCommitted: () => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("person");
  const [aliases, setAliases] = useState("");
  const [notes, setNotes] = useState("");
  const [mats, setMats] = useState<Material[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [existing, setExisting] = useState<{ id: string; title: string } | null>(null);
  const [upload, setUpload] = useState<Upload>(EMPTY_UPLOAD);
  const [busy, setBusy] = useState<"" | "search" | "extract" | "draft" | "commit">("");
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [md, setMd] = useState("");
  const [view, setView] = useState<"preview" | "source">("preview");
  const [done, setDone] = useState<Done | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (busy !== "draft" && busy !== "commit") return;
    const t0 = performance.now();
    const id = window.setInterval(() => setElapsed(Math.round((performance.now() - t0) / 1000)), 500);
    return () => window.clearInterval(id);
  }, [busy]);

  const terms = () => [title, ...aliases.split(/[,，、;；\s]+/)].map((s) => s.trim()).filter(Boolean);
  async function search() {
    if (!title.trim()) { setErr("请先填写词条名称"); return; }
    setBusy("search"); setErr("");
    try {
      const r = await call<{ existing: string | null; existing_title: string; items: Material[] }>("/materials", { terms: terms(), limit: 30, type });
      setMats(r.items);
      setPicked(new Set(r.items.slice(0, 12).map((m) => m.ref)));
      setExisting(r.existing ? { id: r.existing, title: r.existing_title } : null);
    } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy("extract"); setErr("");
    try {
      const text = /\.(txt|md|csv)$/i.test(f.name) ? await f.text() : (await call<{ text: string }>("/extract", { name: f.name, data: await readAsBase64(f) })).text;
      setUpload((u) => ({ ...u, name: f.name, title: u.title || f.name.replace(/\.[^.]+$/, ""), text }));
    } catch (e: any) { setErr(e.message); } finally { setBusy(""); if (fileRef.current) fileRef.current.value = ""; }
  }
  const uploadPayload = upload.text.trim() ? upload : null;
  async function makeDraft() {
    if (!title.trim()) { setErr("请先填写词条名称"); return; }
    setBusy("draft"); setErr(""); setDone(null);
    try {
      const d = await call<Draft>("/draft", { title, type, aliases, notes, refs: [...picked], upload: uploadPayload, mode: "merge" });
      setDraft(d); setMd(d.markdown); setView("preview");
      if (d.existing) setExisting({ id: d.existing, title: d.existing });
    } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  }
  async function commit() {
    setBusy("commit"); setErr("");
    try {
      const r = await call<Done>("/commit", { markdown: md, upload: uploadPayload, overwrite: !!draft?.existing });
      setDone(r); onCommitted();
    } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  }
  async function withdraw(e: Entry) {
    const what = e.action === "更新" ? `把“${e.title}”恢复到后台修改之前的版本` : `删除后台新增的页面“${e.title}”`;
    if (!window.confirm(`确定要${what}吗？${e.docs.length ? "随它一起上传的资料也会移出知识库。" : ""}`)) return;
    setBusy("commit"); setErr("");
    try { await call(`/withdraw/${encodeURIComponent(e.id)}`, {}); onCommitted(); } catch (er: any) { setErr(er.message); } finally { setBusy(""); }
  }
  function reset() {
    setTitle(""); setAliases(""); setNotes(""); setMats(null); setPicked(new Set()); setExisting(null);
    setUpload(EMPTY_UPLOAD); setDraft(null); setMd(""); setDone(null); setErr("");
  }
  const parts = useMemo(() => splitFrontmatter(md), [md]);
  const nPicked = picked.size + (uploadPayload ? 1 : 0);

  return (
    <div className="admin-grid">
      <div className="admin-main">
        <div className="admin-step card">
          <div className="step-title"><b>1</b>词条与资料</div>
          <div className="admin-fields">
            <label>词条名称<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：蔡元培、宋刊《古文集成》、文禄堂" /></label>
            <label>类型
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {Object.entries(status.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>别名 / 字号<input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="用逗号分隔，如：孑民，蔡孑民" /></label>
            <label className="wide">给大模型的补充说明（可选，不作为出处）<textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="如：重点写他与傅增湘在五四前后的往来" /></label>
          </div>
          <div className="row">
            <button className="btn" onClick={search} disabled={busy !== ""}>{busy === "search" ? "检索中…" : "从知识库检索资料"}</button>
            <span className="muted small">按词条名称与别名检索原文段落，优先列出同时提到傅增湘的段落。</span>
          </div>
          {existing && <div className="admin-note">知识库已有页面 <Link className="link-zhu" to={`/wiki/${encodeURIComponent(existing.id)}`}>{existing.title}</Link>：生成时会在原页基础上合并补充，写入时更新原页（旧版本自动备份）。</div>}
          {mats && (
            <div className="admin-mats">
              <div className="admin-mats-head">
                <b>知识库资料 {mats.length} 条 · 已选 {picked.size}</b>
                <span>
                  <button className="btn ghost small" onClick={() => setPicked(new Set(mats.map((m) => m.ref)))}>全选</button>
                  <button className="btn ghost small" onClick={() => setPicked(new Set())}>清空</button>
                </span>
              </div>
              {!mats.length && <p className="muted small">没有检索到相关段落，可以换个名字或直接上传资料。</p>}
              <ul data-scroll-trap>
                {mats.map((m) => (
                  <li key={m.ref} className={picked.has(m.ref) ? "on" : ""}>
                    <label>
                      <input type="checkbox" checked={picked.has(m.ref)} onChange={() => setPicked((s) => { const n = new Set(s); n.has(m.ref) ? n.delete(m.ref) : n.add(m.ref); return n; })} />
                      <span className="admin-mat-meta"><b>{m.cite}</b>《{m.title.slice(0, 26)}》<code>{m.ref}</code></span>
                    </label>
                    <p>{m.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details className="admin-upload" open={!!upload.text}>
            <summary>上传或粘贴原始资料（可选）</summary>
            <div className="admin-fields">
              <label>资料标题<input value={upload.title} onChange={(e) => setUpload({ ...upload, title: e.target.value })} placeholder="如：傅增湘致某某函（1925）" /></label>
              <label>作者 / 来源<input value={upload.author} onChange={(e) => setUpload({ ...upload, author: e.target.value })} placeholder="如：傅增湘；或《某某日记》" /></label>
              <label className="wide">原文
                <textarea rows={7} value={upload.text} onChange={(e) => setUpload({ ...upload, text: e.target.value })} placeholder="把原文粘贴在这里，按段落分行。写入时会作为一篇新的补充文献入库，词条中的出处可以点开查看。" />
              </label>
            </div>
            <div className="row">
              <input ref={fileRef} type="file" accept=".txt,.md,.docx,.pdf" hidden onChange={(e) => onFile(e.target.files?.[0])} />
              <button className="btn small" onClick={() => fileRef.current?.click()} disabled={busy !== ""}>{busy === "extract" ? "读取中…" : "选择文件（txt / md / docx / pdf）"}</button>
              {upload.name && <span className="muted small">{upload.name} · {upload.text.length} 字</span>}
              {upload.text && <button className="btn ghost small" onClick={() => setUpload(EMPTY_UPLOAD)}>清除</button>}
            </div>
          </details>
        </div>

        <div className="admin-step card">
          <div className="step-title"><b>2</b>大模型整理</div>
          <div className="row">
            <button className="btn solid" onClick={makeDraft} disabled={busy !== "" || !title.trim() || !nPicked}>
              {busy === "draft" ? `整理中… ${elapsed}s` : draft ? "重新生成" : "生成词条草稿"}
            </button>
            <span className="muted small">{nPicked ? `将依据 ${picked.size} 条知识库资料${uploadPayload ? " 和 1 份上传资料" : ""}整理，通常需要 30–60 秒。` : "请先勾选资料或上传原文。"}</span>
          </div>
          {busy === "draft" && <div className="admin-progress"><span /></div>}
          <AnimatePresence>
            {draft && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="admin-draft">
                <div className="admin-draft-head">
                  <span className="muted small">{draft.model} · {draft.seconds}s · 依据 {draft.materials} 段资料 · 页面 id：<code>{draft.id}</code></span>
                  <div className="seg">
                    <button className={view === "preview" ? "on" : ""} onClick={() => setView("preview")}>预览</button>
                    <button className={view === "source" ? "on" : ""} onClick={() => setView("source")}>源码（可编辑）</button>
                  </div>
                </div>
                {!!draft.warnings.length && <ul className="admin-warn">{draft.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
                {view === "preview" ? (
                  <div className="admin-preview">
                    <pre className="admin-fm">{parts.fm}</pre>
                    <Markdown text={parts.body} className="wiki-md" />
                  </div>
                ) : (
                  <textarea className="admin-source" value={md} onChange={(e) => setMd(e.target.value)} spellCheck={false} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="admin-step card">
          <div className="step-title"><b>3</b>写入知识库</div>
          <div className="row">
            <button className="btn solid" onClick={commit} disabled={!draft || busy !== ""}>
              {busy === "commit" ? `写入并重建索引… ${elapsed}s` : draft?.existing ? "合并更新已有页面" : "确认写入知识库"}
            </button>
            <span className="muted small">写入 wiki 目录、记入 log.md，并重建检索索引、人物关系与向量。</span>
          </div>
          {done && (
            <motion.div className="admin-done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
              <b>已写入 {done.path}</b>
              <p className="small">重建索引：{done.pages} 个页面、{done.mentions} 条提及统计，向量更新 {done.embedded} 条，用时 {done.seconds}s{done.docs.length ? `；上传资料入库为 ${done.docs.join("、")}` : ""}。</p>
              <div className="row">
                <Link className="btn small solid" to={done.url}>查看词条 →</Link>
                {type === "person" && <Link className="btn small" to="/network">到书林往来查看</Link>}
                <button className="btn small ghost" onClick={reset}>再补充一个</button>
              </div>
            </motion.div>
          )}
        </div>
        {err && <div className="admin-error">{err}</div>}
      </div>

      <aside className="admin-side">
        <div className="card side-card">
          <h4>知识库现状</h4>
          <p className="small">{status.pages} 个 wiki 页面 · {status.documents} 篇文献</p>
          {status.note && <p className="small muted">{status.note}</p>}
        </div>
        <div className="card side-card">
          <h4>整理规范</h4>
          <ul className="small admin-rules">
            <li>每个事实句都要带出处，出处只能来自所选资料。</li>
            <li>人物页重点写与傅增湘的具体交集；书要落到具体版本。</li>
            <li>材料矛盾时并列写出，不补写心理活动、不推测结局。</li>
            <li>关系连线必须有日期和出处，写入后自动出现在书林往来。</li>
          </ul>
        </div>
        <div className="card side-card">
          <h4>最近补充</h4>
          {!status.entries.length && <p className="small muted">还没有通过后台补充的词条。</p>}
          <ul className="plain-list admin-entries">
            {status.entries.map((e) => (
              <li key={e.id + e.time}>
                <Link className="link-zhu" to={`/wiki/${encodeURIComponent(e.id)}`}>{e.title}</Link>
                <span className="muted small"> {e.action} · {e.time.slice(5, 16).replace("T", " ")}</span>
                <button className="admin-undo" disabled={busy !== ""} onClick={() => withdraw(e)} title={e.action === "更新" ? "恢复到后台修改前的版本" : "删除这个后台新增的页面"}>撤回</button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
