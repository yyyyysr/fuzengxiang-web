import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Markdown, sectionId } from "../components/Markdown";
import { BackLink, ErrorNote, Loading, Reveal } from "../components/ui";
import { api, routeFor, stripLinks, TYPE_LABEL, type WikiPage } from "../lib/api";
import { useAgent, usePageAgent } from "../lib/store";

const SKIP_FM = new Set(["id", "type", "title", "summary", "aliases", "ambiguous_aliases", "updated", "status", "relations", "sources",
  "mention_aliases", "route", "evidence_level", "story_rank", "case_rank", "date_precision", "supported_hypothesis", "added_by"]);
const GIST = /^\*\*一句话\*\*[：:]\s*(.+)$/m;

export function WikiView() {
  const { id = "" } = useParams();
  const [p, setP] = useState<WikiPage | null>(null);
  const [err, setErr] = useState("");
  const { openChat } = useAgent();
  useEffect(() => { setP(null); setErr(""); api<WikiPage>(`/wiki/${encodeURIComponent(id)}`).then(setP).catch((e) => setErr(e.message)); }, [id]);
  const module = p?.type === "guide" ? (p.id === "网站导览" ? "这个网站" : p.aliases?.[0] || p.title.split("：")[0]) : "";
  usePageAgent(!p ? {} : p.type === "guide"
    ? { id: p.id, title: p.title, tip: "这是网站的玩法说明。看完可以点“打开这个栏目”直接体验，有不清楚的地方也可以问我。", questions: [`${module}怎么用？`, `${module}有哪些功能？`] }
    : { id: p.id, title: p.title, tip: `这是知识库中的《${p.title}》。正文里朱色虚线的链接可以点开出处原文。`, questions: [`用三句话概括《${p.title}》`, `关于${p.title}，不同材料的说法一致吗？`] }, [p?.id]);
  if (err) return <div className="page"><ErrorNote msg={err} /></div>;
  if (!p) return <div className="page narrow"><Loading h={500} /></div>;
  if (p.type === "story") return <Navigate to={`/stories/${encodeURIComponent(p.id)}`} replace />;

  const fm = p.frontmatter;
  const facts = Object.entries(fm).filter(([k, v]) => !SKIP_FM.has(k) && v !== "" && v !== null && !(Array.isArray(v) && !v.length));
  const gist = p.body.match(GIST)?.[1];
  const body = p.body.replace(/^# .*\n/, "").replace(GIST, "").trim();
  const toc = [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]);
  const glyph = (p.title.match(/《(.)/)?.[1] || p.title.replace(/^\d+\s*年?/, "")[0] || "藏");
  const years = p.type === "person" && fm.birth ? `${fm.birth}—${fm.death || "?"}` : p.type === "event" && fm.date ? String(fm.date) : "";
  const mentions = (p as WikiPage & { mention_total?: number; mention_doc_count?: number });

  return (
    <div className={`page wiki-view t-${p.type}`}>
      <header className="container wiki-hero">
        <BackLink fallback={p.type === "guide" ? "/" : "/search"} label={p.type === "guide" ? "首页" : "检索"} />
        <div className="wiki-hero-card">
          <span className="wiki-glyph brush" aria-hidden>{glyph}</span>
          <div className="wiki-hero-meta">
            <span className="seal solid">{TYPE_LABEL[p.type] || p.type}</span>
            {years && <span className="wiki-years">{years}</span>}
            {p.type === "person" && Array.isArray(fm.roles) && <span className="muted small">{fm.roles.join(" · ")}</span>}
          </div>
          <h1 className="wiki-title">{p.title}</h1>
          {p.summary && <p className="wiki-summary">{stripLinks(p.summary)}</p>}
          <div className="wiki-hero-foot">
            {p.type === "guide" && typeof fm.route === "string" && fm.route !== "/" && (
              <Link className="btn small solid" to={fm.route}>打开这个栏目 →</Link>
            )}
            {!!mentions.mention_total && (
              <span className="muted small">在 {mentions.mention_doc_count} 篇文献中被提及 {mentions.mention_total} 次</span>
            )}
            <button className="btn small zhu" onClick={() => openChat(p.type === "guide" ? `${module}怎么用？` : `请介绍一下${p.title}`)}>问小傅</button>
          </div>
        </div>
      </header>
      <div className="wiki-layout container">
        <article className="wiki-article">
          {gist && <Reveal className="wiki-gist"><span className="brush">要</span><Markdown text={gist} titles={p.link_titles} /></Reveal>}
          <Reveal><Markdown text={body} titles={p.link_titles} className="wiki-md" /></Reveal>
        </article>
        <aside className="wiki-side">
          {toc.length > 1 && (
            <nav className="card side-card wiki-toc" aria-label="本页目录">
              <h4>本页目录</h4>
              <ol>
                {toc.map((h) => (
                  <li key={h}><a href={`#${sectionId(h)}`} onClick={(e) => {
                    e.preventDefault();
                    const el = document.getElementById(sectionId(h));
                    const lenis = (window as any).__lenis;
                    if (el && lenis) lenis.scrollTo(el, { offset: -90, duration: 1 }); else el?.scrollIntoView({ behavior: "smooth" });
                  }}>{stripLinks(h)}</a></li>
                ))}
              </ol>
            </nav>
          )}
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
                  <li key={i}><span className="seal solid">{r.type}</span><div><Markdown text={`${r.target} ${r.date ? "· " + r.date : ""}`} titles={p.link_titles} /><p className="small">{r.label}</p>
                    {!!r.evidence?.length && <Markdown className="rel-src" text={"出处：" + r.evidence.join("；")} titles={p.link_titles} />}</div></li>
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
        </aside>
      </div>
    </div>
  );
}

const FM_LABEL: Record<string, string> = {
  birth: "生年", death: "卒年", native_place: "籍贯", roles: "身份", relation_types: "交集类型", work: "作品", edition: "版本",
  current_holder: "现藏", date: "日期", date_end: "结束", themes: "主题", participants: "人物", books: "书籍",
  places: "地点", disputed: "有异说", story: "故事", question: "疑问", hypotheses: "假说",
  doc: "全文", authors: "作者", year: "年份", origin: "来源", citation: "出处", keywords: "关键词", alternates: "副本",
  people: "人物", works: "项目", related: "相关", images: "图像", category: "四部",
};
