import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { ErrorNote, Loading, PageHeader } from "../components/ui";
import { api, stripLinks, type NetEdge, type NetNode, type Person, type WikiPage } from "../lib/api";
import { useAgent, usePageAgent } from "../lib/store";

type N = NetNode & SimulationNodeDatum & { degree: number };
type E = NetEdge & { s: N; t: N };
const TYPE_COLOR: Record<string, string> = { person: "#a8322a", book: "#2e4855", work: "#5d7a69", org: "#a8873f", place: "#6b5a46" };
const TYPE_NAME: Record<string, string> = { person: "人物", book: "书籍", work: "项目", org: "机构", place: "地点" };

export function Network() {
  const [data, setData] = useState<{ nodes: NetNode[]; edges: NetEdge[] } | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [err, setErr] = useState("");
  const [show, setShow] = useState<Record<string, boolean>>({ person: true, book: true, work: true, org: true, place: false });
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    api<{ nodes: NetNode[]; edges: NetEdge[] }>("/network").then(setData).catch((e) => setErr(e.message));
    api<Person[]>("/people").then(setPeople).catch(() => {});
  }, []);
  usePageAgent({ tip: "点一个人物，只看与他有关的书和事件。连线标签写的是实际发生的事。", questions: ["赵万里和傅增湘有哪些交集？", "徐森玉帮傅增湘做过什么？"] });

  return (
    <div className="page network">
      <PageHeader eyebrow="书林往来" title="他与谁因书发生交集" lead={<p>傅增湘居中。人物数量由可核实的材料决定，不为画满图谱而增加无来源的连线。</p>} />
      <section className="container">
        <div className="net-legend">
          {Object.keys(TYPE_NAME).map((t) => (
            <button key={t} className={`chip ${show[t] ? "active" : ""}`} onClick={() => setShow((s) => ({ ...s, [t]: !s[t] }))}>
              <i style={{ background: TYPE_COLOR[t] }} />{TYPE_NAME[t]}
            </button>
          ))}
        </div>
        {err && <ErrorNote msg={err} />}
        {!data && !err && <Loading h={560} />}
        <div className="net-key">
          <span><i className="k-rel" />有出处的交集（连线标签为关系类型与年份，点人物看证据）</span>
          <span><i className="k-link" />知识页之间相互提及</span>
          <span><i className="k-iso" />暂无可核实交集（材料不足，不画无来源的连线）</span>
        </div>
        {data && (
          <div className="net-wrap">
            <Graph data={data} show={show} sel={sel} hover={hover} onSel={setSel} onHover={setHover} />
            <AnimatePresence>{sel && <SidePanel id={sel} people={people} edges={data.edges} onClose={() => setSel(null)} />}</AnimatePresence>
          </div>
        )}
        <div className="net-list">
          {people.map((p) => (
            <button key={p.id} className={`net-list-item ${sel === p.id ? "on" : ""}`} onClick={() => setSel(p.id)}>
              <b>{p.title}</b><span className="muted small">{p.summary.slice(0, 30)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Graph({ data, show, sel, hover, onSel, onHover }: {
  data: { nodes: NetNode[]; edges: NetEdge[] }; show: Record<string, boolean>; sel: string | null; hover: string | null;
  onSel: (id: string) => void; onHover: (id: string | null) => void;
}) {
  const W = 1100, H = 640;
  const [tick, setTick] = useState(0);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const { nodes, edges } = useMemo(() => {
    const keep = data.nodes.filter((n) => show[n.type] || n.id === "傅增湘");
    const ids = new Set(keep.map((n) => n.id));
    const ns: N[] = keep.map((n) => ({ ...n, degree: 0 }));
    const byId = new Map(ns.map((n) => [n.id, n]));
    // One line per pair of nodes; several relations between the same pair share a label.
    const pairs = new Map<string, E & { types: string[]; years: string[] }>();
    data.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).forEach((e) => {
      const key = [e.source, e.target].sort().join("|");
      const cur = pairs.get(key);
      const year = String(e.date || "").slice(0, 4);
      if (!cur) {
        pairs.set(key, { ...e, s: byId.get(e.source)!, t: byId.get(e.target)!, types: e.kind === "relation" ? [e.type] : [], years: /\d{4}/.test(year) ? [year] : [] });
      } else {
        if (e.kind === "relation") { cur.kind = "relation"; if (!cur.types.includes(e.type)) cur.types.push(e.type); }
        if (/\d{4}/.test(year) && !cur.years.includes(year)) cur.years.push(year);
      }
    });
    const es: E[] = [...pairs.values()].map((e) => {
      const ys = e.years.sort();
      return { ...e, type: e.types.join("·"), date: ys.length > 1 ? `${ys[0]}—${ys[ys.length - 1]}` : ys[0] || "" };
    });
    es.forEach((e) => { e.s.degree++; e.t.degree++; });
    const center = byId.get("傅增湘");
    if (center) { center.fx = W / 2; center.fy = H / 2; }
    return { nodes: ns.filter((n) => n.degree > 0 || n.type === "person"), edges: es };
  }, [data, show]);

  useEffect(() => {
    const sim = forceSimulation<N>(nodes)
      .force("link", forceLink<N, any>(edges.map((e) => ({ source: e.s, target: e.t }))).distance((l: any) => (l.target.id === "傅增湘" || l.source.id === "傅增湘" ? 190 : 110)).strength(0.5))
      .force("charge", forceManyBody().strength(-420))
      .force("collide", forceCollide<N>().radius((n) => r(n) + 18))
      .force("x", forceX(W / 2).strength(0.04))
      .force("y", forceY(H / 2).strength(0.06))
      .alpha(1).alphaDecay(0.03)
      .on("tick", () => setTick((t) => t + 1));
    return () => { sim.stop(); };
  }, [nodes, edges]);

  const focus = hover || sel;
  const neighbors = useMemo(() => {
    if (!focus) return null;
    const s = new Set([focus]);
    edges.forEach((e) => { if (e.s.id === focus) s.add(e.t.id); if (e.t.id === focus) s.add(e.s.id); });
    return s;
  }, [focus, edges]);

  return (
    <svg className="net-svg" viewBox={`0 0 ${W} ${H}`} data-tick={tick} preserveAspectRatio="xMidYMid slice"
      onWheel={(e) => { const k = Math.min(2.5, Math.max(0.5, view.k * (e.deltaY < 0 ? 1.1 : 0.9))); setView((v) => ({ ...v, k })); }}
      onPointerDown={(e) => { if ((e.target as Element).tagName === "svg") drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; }}
      onPointerMove={(e) => { if (drag.current) setView((v) => ({ ...v, x: drag.current!.vx + (e.clientX - drag.current!.x), y: drag.current!.vy + (e.clientY - drag.current!.y) })); }}
      onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
      <defs>
        <radialGradient id="glow"><stop offset="0" stopColor="#a8322a" stopOpacity=".25" /><stop offset="1" stopColor="#a8322a" stopOpacity="0" /></radialGradient>
      </defs>
      <g transform={`translate(${view.x + (W / 2) * (1 - view.k)} ${view.y + (H / 2) * (1 - view.k)}) scale(${view.k})`}>
        <circle cx={W / 2} cy={H / 2} r={150} fill="url(#glow)" className="net-pulse" />
        {edges.map((e, i) => {
          const dim = neighbors && !(neighbors.has(e.s.id) && neighbors.has(e.t.id));
          const mx = ((e.s.x || 0) + (e.t.x || 0)) / 2, my = ((e.s.y || 0) + (e.t.y || 0)) / 2;
          return (
            <g key={i} className={`net-edge ${dim ? "dim" : ""} ${e.kind}`}>
              <line x1={e.s.x} y1={e.s.y} x2={e.t.x} y2={e.t.y} style={{ strokeWidth: e.kind === "relation" ? 1.2 + Math.min(e.type.split("·").length, 4) * 0.5 : undefined }} />
              {neighbors && !dim && e.type && e.kind === "relation" && <text x={mx} y={my - 4} textAnchor="middle">{e.type}{e.date ? ` · ${e.date}` : ""}</text>}
            </g>
          );
        })}
        {nodes.map((n) => {
          const dim = neighbors && !neighbors.has(n.id);
          const R = r(n);
          return (
            <g key={n.id} className={`net-node t-${n.type} ${dim ? "dim" : ""} ${sel === n.id ? "sel" : ""} ${n.degree === 0 ? "isolated" : ""}`} transform={`translate(${n.x || 0} ${n.y || 0})`}
              onClick={() => onSel(n.id)} onPointerEnter={() => onHover(n.id)} onPointerLeave={() => onHover(null)}>
              {n.type === "person" ? <circle r={R} fill={TYPE_COLOR.person} /> : n.type === "book" || n.type === "work"
                ? <rect x={-R} y={-R} width={R * 2} height={R * 2} rx={3} fill={TYPE_COLOR[n.type]} />
                : <rect x={-R} y={-R} width={R * 2} height={R * 2} rx={R} fill={TYPE_COLOR[n.type] || "#888"} transform="rotate(45)" />}
              <text className="net-char" dy="0.35em" textAnchor="middle" fontSize={R * 0.95}>{glyph(n)}</text>
              {n.degree === 0 && <circle className="iso-ring" r={R + 6} />}
              <text className="net-label" y={R + 15} textAnchor="middle">{n.title.replace(/（.*?）/g, "").slice(0, 12)}{n.degree === 0 ? "（待补）" : ""}</text>
              <title>{n.degree === 0 ? `${n.title}：暂无可核实的交集材料` : n.title}</title>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

const r = (n: N) => (n.id === "傅增湘" ? 34 : n.type === "person" ? 16 + Math.min(n.degree, 6) * 1.6 : 12);
const glyph = (n: N) => (n.type === "person" ? n.title[0] : (n.title.match(/《(.)/)?.[1] || n.title[0]));

function SidePanel({ id, people, edges, onClose }: { id: string; people: Person[]; edges: NetEdge[]; onClose: () => void }) {
  const [page, setPage] = useState<WikiPage | null>(null);
  const { openChat, express } = useAgent();
  useEffect(() => { setPage(null); api<WikiPage>(`/wiki/${encodeURIComponent(id)}`).then(setPage).catch(() => {}); express("happy", 2000); }, [id, express]);
  const person = people.find((p) => p.id === id);
  const related = edges.filter((e) => e.source === id || e.target === id);
  return (
    <motion.aside className="net-panel card" data-scroll-trap initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}>
      <button className="drawer-close" onClick={onClose}>×</button>
      {!page ? <Loading h={200} /> : (
        <>
          <span className="eyebrow">{person ? "人物" : page.type}</span>
          <h3>{page.title}</h3>
          {person?.birth && <p className="muted small">{person.birth}—{person.death || "?"}</p>}
          <p>{page.summary}</p>
          <h4>交集</h4>
          {!person?.relations?.length && !related.length && (
            <p className="iso-note">知识库目前还没有整理出此人与傅增湘之间带出处的具体交集，因此图中不画连线。补入材料后（人物页 <code>relations</code> 字段），连线会自动出现。</p>
          )}
          <ul className="rel-list compact">
            {(person?.relations?.length ? person.relations : related.map((e) => ({ target: e.source === id ? e.target : e.source, type: e.type, label: e.label || "", date: e.date, evidence: e.evidence })))
              .map((rl, i) => (
                <li key={i}>
                  <span className="seal solid">{rl.type}</span>
                  <div>
                    <b>{stripLinks(rl.target)}</b>{rl.date ? <span className="muted small"> · {String(rl.date)}</span> : null}
                    {rl.label && <p>{rl.label}</p>}
                    {!!rl.evidence?.length && <Markdown text={"证据：" + rl.evidence.join("；")} />}
                  </div>
                </li>
              ))}
          </ul>
          <div className="row">
            <Link className="btn small" to={`/wiki/${encodeURIComponent(id)}`}>人物卡全文</Link>
            <button className="btn small zhu" onClick={() => openChat(`${page.title}和傅增湘有哪些具体交集？`)}>问小傅</button>
          </div>
        </>
      )}
    </motion.aside>
  );
}
