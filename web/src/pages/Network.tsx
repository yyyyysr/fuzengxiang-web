import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { ErrorNote, Loading, PageHeader, Reveal } from "../components/ui";
import { api, routeFor, stripLinks, TYPE_LABEL, type NetEdge, type NetNode, type Person, type WikiPage } from "../lib/api";
import { useAgent, usePageAgent } from "../lib/store";

type N = NetNode & SimulationNodeDatum & { degree: number };
type E = NetEdge & { s: N; t: N; types: string[]; vias: { id: string; title: string; type?: string }[] };
type Kind = NetEdge["kind"];
const TYPE_COLOR: Record<string, string> = { person: "#a8322a", book: "#2e4855", work: "#5d7a69", org: "#a8873f", place: "#6b5a46" };
const TYPE_NAME: Record<string, string> = { person: "人物", book: "书籍", work: "项目", org: "机构", place: "地点" };
const KIND_NAME: Record<Kind, string> = { relation: "有出处的关系", event: "同见一事", link: "页面互相提及" };
const CENTER = "傅增湘";

export function Network() {
  const [data, setData] = useState<{ nodes: NetNode[]; edges: NetEdge[] } | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [err, setErr] = useState("");
  const [show, setShow] = useState<Record<string, boolean>>({ person: true, book: true, work: true, org: true, place: true });
  const [kinds, setKinds] = useState<Record<Kind, boolean>>({ relation: true, event: true, link: false });
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    api<{ nodes: NetNode[]; edges: NetEdge[] }>("/network").then(setData).catch((e) => setErr(e.message));
    api<Person[]>("/people").then(setPeople).catch(() => {});
  }, []);
  usePageAgent({ tip: "气泡越大，这个人（或这部书、这个机构）在资料里被提到得越多。点一个气泡，看他和傅增湘、和其他人、和书与机构的关系。", questions: ["蔡元培和傅增湘有哪些交集？", "徐森玉帮傅增湘做过什么？"] });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    data?.nodes.forEach((n) => { c[n.type] = (c[n.type] || 0) + 1; });
    return c;
  }, [data]);
  const ranking = useMemo(() => (data?.nodes || []).filter((n) => n.id !== CENTER && show[n.type]).sort((a, b) => b.mentions - a.mentions).slice(0, 16), [data, show]);
  const top = ranking[0]?.mentions || 1;

  return (
    <div className="page network">
      <PageHeader eyebrow="书林往来" title="他与谁因书发生交集" lead={<p>以傅增湘为中心，画出人物、藏书、影印项目、机构与地点之间有材料依据的关系。气泡大小表示在整理入库的资料中被提及的次数。</p>} />
      <section className="container">
        <div className="net-controls">
          <div className="net-legend">
            {Object.keys(TYPE_NAME).map((t) => (
              <button key={t} className={`chip ${show[t] ? "active" : ""}`} onClick={() => setShow((s) => ({ ...s, [t]: !s[t] }))} aria-pressed={show[t]}>
                <i style={{ background: TYPE_COLOR[t] }} />{TYPE_NAME[t]} {counts[t] || 0}
              </button>
            ))}
          </div>
          <div className="net-legend">
            {(Object.keys(KIND_NAME) as Kind[]).map((k) => (
              <button key={k} className={`chip kind ${kinds[k] ? "active" : ""}`} onClick={() => setKinds((s) => ({ ...s, [k]: !s[k] }))} aria-pressed={kinds[k]}>
                <i className={`k-${k}`} />{KIND_NAME[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="net-key">
          <span><i className="k-size"><b /><b /><b /></i>气泡越大，在资料中被提及越多</span>
          <span><i className="k-relation" />有出处的关系（点气泡看出处）</span>
          <span><i className="k-event" />同见于一件事或一个故事</span>
          <span><i className="k-link" />知识页之间相互提及</span>
        </div>
        {err && <ErrorNote msg={err} />}
        {!data && !err && <Loading h={560} />}
        {data && (
          <div className="net-wrap">
            <Graph data={data} show={show} kinds={kinds} sel={sel} hover={hover} onSel={setSel} onHover={setHover} />
            <AnimatePresence>{sel && <SidePanel id={sel} nodes={data.nodes} people={people} edges={data.edges} kinds={kinds} onSel={setSel} onClose={() => setSel(null)} />}</AnimatePresence>
          </div>
        )}
        {!!ranking.length && (
          <Reveal className="net-rank card">
            <h4>资料中被提及最多</h4>
            <ol>
              {ranking.map((n) => (
                <li key={n.id}>
                  <button onClick={() => setSel(n.id)} className={sel === n.id ? "on" : ""}>
                    <span className="net-rank-name"><i style={{ background: TYPE_COLOR[n.type] }} />{n.title.replace(/（.*?）/g, "")}</span>
                    <span className="net-rank-bar"><motion.b initial={{ width: 0 }} whileInView={{ width: `${Math.max(3, (n.mentions / top) * 100)}%` }} viewport={{ once: true }} transition={{ duration: 0.8 }} /></span>
                    <span className="net-rank-n">{n.mentions} 次 · {n.docs} 篇</span>
                  </button>
                </li>
              ))}
            </ol>
          </Reveal>
        )}
      </section>
    </div>
  );
}

function Graph({ data, show, kinds, sel, hover, onSel, onHover }: {
  data: { nodes: NetNode[]; edges: NetEdge[] }; show: Record<string, boolean>; kinds: Record<Kind, boolean>; sel: string | null; hover: string | null;
  onSel: (id: string) => void; onHover: (id: string | null) => void;
}) {
  const W = 1100, H = 680;
  const [tick, setTick] = useState(0);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const { nodes, edges, maxM } = useMemo(() => {
    const keep = data.nodes.filter((n) => show[n.type] || n.id === CENTER);
    const ids = new Set(keep.map((n) => n.id));
    const ns: N[] = keep.map((n) => ({ ...n, degree: 0 }));
    const byId = new Map(ns.map((n) => [n.id, n]));
    const title = (id: string) => data.nodes.find((n) => n.id === id)?.title || id;
    const pairs = new Map<string, E>();
    data.edges.filter((e) => kinds[e.kind] && ids.has(e.source) && ids.has(e.target)).forEach((e) => {
      const key = [e.source, e.target].sort().join("|");
      const cur = pairs.get(key);
      const year = String(e.date || "").slice(0, 4);
      if (!cur) {
        pairs.set(key, { ...e, s: byId.get(e.source)!, t: byId.get(e.target)!, types: e.kind === "relation" ? [e.type] : [],
          vias: e.via ? [{ id: e.via, title: e.label || title(e.via), type: e.via_type }] : [], date: /\d{4}/.test(year) ? year : "" });
      } else if (e.kind === "relation" && !cur.types.includes(e.type)) {
        cur.types.push(e.type);
        cur.kind = "relation";
      }
    });
    const es = [...pairs.values()];
    es.forEach((e) => { e.s.degree++; e.t.degree++; e.type = e.types.join("·") || (e.kind === "event" ? "同见一事" : "提及"); });
    const center = byId.get(CENTER);
    if (center) { center.fx = W / 2; center.fy = H / 2; }
    const maxM = Math.max(1, ...ns.filter((n) => n.id !== CENTER).map((n) => n.mentions || 0));
    return { nodes: ns.filter((n) => n.degree > 0 || n.type === "person"), edges: es, maxM };
  }, [data, show, kinds]);

  const r = (n: N) => (n.id === CENTER ? 40 : (n.type === "person" ? 11 : 9) + 23 * Math.sqrt((n.mentions || 0) / maxM));

  useEffect(() => {
    const sim = forceSimulation<N>(nodes)
      .force("link", forceLink<N, any>(edges.map((e) => ({ source: e.s, target: e.t, kind: e.kind })))
        .distance((l: any) => (l.target.id === CENTER || l.source.id === CENTER ? 210 : l.kind === "relation" ? 120 : 150))
        .strength((l: any) => (l.kind === "relation" ? 0.55 : 0.2)))
      .force("charge", forceManyBody().strength(-380))
      .force("collide", forceCollide<N>().radius((n) => r(n) + 16))
      .force("x", forceX(W / 2).strength(0.045))
      .force("y", forceY(H / 2).strength(0.07))
      .alpha(1).alphaDecay(0.028)
      .on("tick", () => setTick((t) => t + 1));
    return () => { sim.stop(); };
  }, [nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps

  const focus = hover || sel;
  const neighbors = useMemo(() => {
    if (!focus) return null;
    const s = new Set([focus]);
    edges.forEach((e) => { if (e.s.id === focus) s.add(e.t.id); if (e.t.id === focus) s.add(e.s.id); });
    return s;
  }, [focus, edges]);

  const zoom = (f: number) => setView((v) => ({ ...v, k: Math.min(2.6, Math.max(0.5, v.k * f)) }));
  return (
    <>
    <div className="net-zoom" role="group" aria-label="缩放">
      <button onClick={() => zoom(1.2)} aria-label="放大">＋</button>
      <button onClick={() => zoom(1 / 1.2)} aria-label="缩小">－</button>
      <button onClick={() => setView({ x: 0, y: 0, k: 1 })} aria-label="复位">复位</button>
    </div>
    <svg className="net-svg" viewBox={`0 0 ${W} ${H}`} data-tick={tick} preserveAspectRatio="xMidYMid meet"
      onPointerDown={(e) => { if ((e.target as Element).tagName === "svg") drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; }}
      onPointerMove={(e) => { if (drag.current) setView((v) => ({ ...v, x: drag.current!.vx + (e.clientX - drag.current!.x), y: drag.current!.vy + (e.clientY - drag.current!.y) })); }}
      onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
      <defs>
        <radialGradient id="glow"><stop offset="0" stopColor="#a8322a" stopOpacity=".25" /><stop offset="1" stopColor="#a8322a" stopOpacity="0" /></radialGradient>
      </defs>
      <g transform={`translate(${view.x + (W / 2) * (1 - view.k)} ${view.y + (H / 2) * (1 - view.k)}) scale(${view.k})`}>
        <circle cx={W / 2} cy={H / 2} r={160} fill="url(#glow)" className="net-pulse" />
        {edges.map((e, i) => {
          const dim = neighbors && !(neighbors.has(e.s.id) && neighbors.has(e.t.id));
          const mx = ((e.s.x || 0) + (e.t.x || 0)) / 2, my = ((e.s.y || 0) + (e.t.y || 0)) / 2;
          const label = e.kind === "relation" ? `${e.type}${e.date ? ` · ${e.date}` : ""}` : e.kind === "event" ? (e.vias[0]?.title || "").replace(/^\d{4}\s*年?\s*/, "").slice(0, 12) : "";
          return (
            <g key={i} className={`net-edge ${dim ? "dim" : ""} ${e.kind}`}>
              <line x1={e.s.x} y1={e.s.y} x2={e.t.x} y2={e.t.y} style={{ strokeWidth: e.kind === "relation" ? 1.2 + Math.min(e.types.length, 4) * 0.5 : undefined }} />
              {neighbors && !dim && label && <text x={mx} y={my - 4} textAnchor="middle">{label}</text>}
            </g>
          );
        })}
        {nodes.map((n) => {
          const dim = neighbors && !neighbors.has(n.id);
          const R = r(n);
          const big = R >= 17 || n.id === focus || neighbors?.has(n.id);
          return (
            <g key={n.id} className={`net-node t-${n.type} ${dim ? "dim" : ""} ${sel === n.id ? "sel" : ""} ${n.degree === 0 ? "isolated" : ""}`} transform={`translate(${n.x || 0} ${n.y || 0})`}
              onClick={() => onSel(n.id)} onPointerEnter={() => onHover(n.id)} onPointerLeave={() => onHover(null)}>
              {n.type === "person" ? <circle r={R} fill={TYPE_COLOR.person} /> : n.type === "book" || n.type === "work"
                ? <rect x={-R} y={-R} width={R * 2} height={R * 2} rx={3} fill={TYPE_COLOR[n.type]} />
                : <rect x={-R * 0.86} y={-R * 0.86} width={R * 1.72} height={R * 1.72} rx={R * 0.3} fill={TYPE_COLOR[n.type] || "#888"} transform="rotate(45)" />}
              <text className="net-char" dy="0.35em" textAnchor="middle" fontSize={R * 0.95}>{glyph(n)}</text>
              {n.degree === 0 && <circle className="iso-ring" r={R + 6} />}
              {big && <text className="net-label" y={R + 14} textAnchor="middle">{n.title.replace(/（.*?）/g, "").slice(0, 12)}</text>}
              <title>{`${n.title}｜${TYPE_NAME[n.type]}｜资料中被提及 ${n.mentions} 次（${n.docs} 篇）`}</title>
            </g>
          );
        })}
      </g>
    </svg>
    </>
  );
}

const glyph = (n: N) => (n.type === "person" ? n.title[0] : (n.title.match(/《(.)/)?.[1] || n.title[0]));

function SidePanel({ id, nodes, people, edges, kinds, onSel, onClose }: {
  id: string; nodes: NetNode[]; people: Person[]; edges: NetEdge[]; kinds: Record<Kind, boolean>; onSel: (id: string) => void; onClose: () => void;
}) {
  const [page, setPage] = useState<WikiPage | null>(null);
  const { openChat, express } = useAgent();
  useEffect(() => { setPage(null); api<WikiPage>(`/wiki/${encodeURIComponent(id)}`).then(setPage).catch(() => {}); express("happy", 2000); }, [id, express]);
  const node = nodes.find((n) => n.id === id);
  const person = people.find((p) => p.id === id);
  const title = (x: string) => nodes.find((n) => n.id === x)?.title || x;
  const mine = edges.filter((e) => (e.source === id || e.target === id) && e.kind !== "link");
  const rels = mine.filter((e) => e.kind === "relation");
  const events = new Map<string, { via: string; label: string; type?: string; with: string[] }>();
  mine.filter((e) => e.kind === "event" && e.via).forEach((e) => {
    const other = e.source === id ? e.target : e.source;
    const cur = events.get(e.via!) || { via: e.via!, label: e.label || e.via!, type: e.via_type, with: [] };
    if (!cur.with.includes(other)) cur.with.push(other);
    events.set(e.via!, cur);
  });
  const links = edges.filter((e) => e.kind === "link" && (e.source === id || e.target === id)).map((e) => (e.source === id ? e.target : e.source));
  return (
    <motion.aside className="net-panel card" data-scroll-trap initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}>
      <button className="drawer-close" onClick={onClose}>×</button>
      {!page ? <Loading h={200} /> : (
        <>
          <span className="eyebrow">{TYPE_LABEL[page.type] || page.type}</span>
          <h3>{page.title}</h3>
          {person?.birth && <p className="muted small">{person.birth}—{person.death || "?"}</p>}
          {node && <p className="net-mentions">在 <b>{node.docs}</b> 篇资料中被提及 <b>{node.mentions}</b> 次</p>}
          <p>{stripLinks(page.summary)}</p>
          {!!rels.length && (
            <>
              <h4>有出处的关系</h4>
              <ul className="rel-list compact">
                {rels.map((e, i) => (
                  <li key={i}>
                    <span className="seal solid">{e.type}</span>
                    <div>
                      <button className="link-zhu net-jump" onClick={() => onSel(e.source === id ? e.target : e.source)}>{title(e.source === id ? e.target : e.source)}</button>
                      {e.date ? <span className="muted small"> · {String(e.date)}</span> : null}
                      {e.label && <p>{e.label}</p>}
                      {!!e.evidence?.length && <Markdown className="rel-src" text={"出处：" + e.evidence.join("；")} titles={page.link_titles} />}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {kinds.event && events.size > 0 && (
            <>
              <h4>同见于这些事</h4>
              <ul className="net-events">
                {[...events.values()].map((ev) => (
                  <li key={ev.via}>
                    <Link className="link-zhu" to={routeFor(ev.via, ev.type)}>{ev.label}</Link>
                    <span className="muted small"> · 同见：{ev.with.map(title).join("、")}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {kinds.link && links.length > 0 && <p className="small muted">知识页互相提及：{links.map(title).join("、")}</p>}
          {!rels.length && !events.size && <p className="iso-note">知识库目前还没有整理出这一条目与其他人物、书籍或机构之间带出处的具体关系。可以在知识库后台补充资料，连线会自动出现。</p>}
          <div className="row">
            <Link className="btn small" to={routeFor(id, page.type)}>完整词条</Link>
            <button className="btn small zhu" onClick={() => openChat(`${page.title}和傅增湘有哪些具体交集？`)}>问小傅</button>
          </div>
        </>
      )}
    </motion.aside>
  );
}
