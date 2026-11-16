import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { ErrorNote, Loading, Reveal } from "../components/ui";
import { api, routeFor, TYPE_LABEL, type WikiPage } from "../lib/api";
import { useAgent, usePageAgent } from "../lib/store";

const SKIP_FM = new Set(["id", "type", "title", "summary", "aliases", "ambiguous_aliases", "updated", "status", "relations", "sources", "mention_aliases"]);

export function WikiView() {
  const { id = "" } = useParams();
  const [p, setP] = useState<WikiPage | null>(null);
  const [err, setErr] = useState("");
  const { openChat } = useAgent();
  useEffect(() => { setP(null); setErr(""); api<WikiPage>(`/wiki/${encodeURIComponent(id)}`).then(setP).catch((e) => setErr(e.message)); }, [id]);
  usePageAgent(p ? { id: p.id, title: p.title, tip: `这是知识库中的《${p.title}》。正文里朱色虚线的链接可以点开出处原文。`, questions: [`用三句话概括《${p.title}》`, `关于${p.title}，有哪些说法还待核？`] } : {}, [p?.id]);
  if (err) return <div className="page"><ErrorNote msg={err} /></div>;
  if (!p) return <div className="page narrow"><Loading h={500} /></div>;
  if (p.type === "story") return <Navigate to={`/stories/${encodeURIComponent(p.id)}`} replace />;

  const fm = p.frontmatter;
  const facts = Object.entries(fm).filter(([k, v]) => !SKIP_FM.has(k) && v !== "" && v !== null && !(Array.isArray(v) && !v.length));
  const body = p.body.replace(/^# .*\n/, "");
  return (
    <div className="page wiki-view">
      <div className="wiki-layout container">
        <article className="wiki-article">
          <Link to="/search" className="muted small">← 检索</Link>
          <div className="row" style={{ margin: "12px 0" }}>
            <span className="seal solid">{TYPE_LABEL[p.type] || p.type}</span>
            {fm.status && <span className={`seal ${fm.status === "stub" ? "gold" : "qing"}`}>{{ stub: "存根", draft: "初稿", reviewed: "已审" }[fm.status as string] || fm.status}</span>}
          </div>
          <h1 className="wiki-title">{p.title}</h1>
          {p.summary && <p className="wiki-summary">{p.summary}</p>}
          <Reveal><Markdown text={body} titles={p.link_titles} className="wiki-md" /></Reveal>
        </article>
        <aside className="wiki-side">
          {!!facts.length && (
            <div className="card side-card">
              <h4>档案</h4>
              <dl>
                {facts.map(([k, v]) => (
                  <div key={k}><dt>{FM_LABEL[k] || k}</dt><dd><Markdown text={Array.isArray(v) ? v.map(String).join("、") : String(v)} titles={p.link_titles} /></dd></div>
                ))}
              </dl>
            </div>
          )}
          {!!fm.relations?.length && (
            <div className="card side-card">
              <h4>关系</h4>
              <ul className="rel-list compact">
                {fm.relations.map((r: any, i: number) => (
                  <li key={i}><span className="seal solid">{r.type}</span><div><Markdown text={`${r.target} ${r.date ? "· " + r.date : ""}`} titles={p.link_titles} /><p className="small">{r.label}</p></div></li>
                ))}
              </ul>
            </div>
          )}
          {!!p.backlink_cards.length && (
            <div className="card side-card">
              <h4>被这些页面提到</h4>
              <ul className="plain-list">{p.backlink_cards.filter((c) => c.type !== "source").slice(0, 14).map((c) => <li key={c.id}><Link className="link-zhu" to={routeFor(c.id, c.type)}>{c.title}</Link> <span className="muted small">{TYPE_LABEL[c.type]}</span></li>)}</ul>
            </div>
          )}
          {!!p.mentioned_docs.length && (
            <div className="card side-card">
              <h4>在这些文献中出现</h4>
              <ul className="plain-list">{p.mentioned_docs.slice(0, 10).map((d) => <li key={d.doc_id}><Link className="link-zhu" to={`/doc/${d.doc_id}`}>{d.title}</Link> <span className="muted small">×{d.count}</span></li>)}</ul>
            </div>
          )}
          <button className="btn zhu" onClick={() => openChat(`请介绍一下${p.title}`)}>问小傅关于这一页</button>
        </aside>
      </div>
    </div>
  );
}

const FM_LABEL: Record<string, string> = {
  birth: "生年", death: "卒年", native_place: "籍贯", roles: "身份", relation_types: "交集类型", work: "作品", edition: "版本",
  current_holder: "现藏", date: "日期", date_end: "结束", date_precision: "精度", themes: "主题", participants: "人物", books: "书籍",
  places: "地点", evidence_level: "证据层级", disputed: "有异说", story: "故事", question: "疑问", hypotheses: "假说",
  doc: "全文", authors: "作者", year: "年份", origin: "来源", citation: "出处", keywords: "关键词", alternates: "副本",
  people: "人物", works: "项目", related: "相关", images: "图像", story_rank: "序号", case_rank: "序号",
};
