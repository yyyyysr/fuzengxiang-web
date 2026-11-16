import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, routeFor, type Book, type CaseCard, type PageCard, type Person } from "../lib/api";
import { useAgent } from "../lib/store";
import { NAV } from "./Nav";

type Item = { key: string; group: string; glyph: string; title: string; sub?: string; hay: string; run: () => void };
type Lists = { stories: PageCard[]; cases: CaseCard[]; people: Person[]; books: Book[] };

const GROUP_ORDER = ["栏目", "故事", "疑案", "人物", "书籍", "知识页", "操作"];
const NAV_SUB: Record<string, string> = {
  "/": "藏园长卷与六个栏目", "/life": "生平、事例翻卡与年谱影院", "/stories": "十个故事，逐幕放映后排先后", "/cases": "先下判断，再翻证据卡",
  "/shelf": "一部书与傅增湘的关系", "/network": "以傅增湘为中心的关系图", "/gallery": "印鉴、书法、信札、书影",
};

function score(it: Item, q: string) {
  const t = it.title.toLowerCase();
  if (t.startsWith(q)) return 4;
  if (t.includes(q)) return 3;
  return it.hay.includes(q) ? 1 : 0;
}

function Mark({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/** Ctrl/⌘+K (or "/") quick switcher: modules, stories, cases, people, books, wiki search, ask 小傅. */
export function Palette() {
  const nav = useNavigate();
  const { openChat } = useAgent();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [lists, setLists] = useState<Lists | null>(null);
  const [wiki, setWiki] = useState<PageCard[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const show = () => { back.current = document.activeElement as HTMLElement; setOpen(true); };
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input,textarea,[contenteditable]");
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setOpen((v) => { if (!v) back.current = document.activeElement as HTMLElement; return !v; }); }
      else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); show(); }
    };
    window.addEventListener("fzx:palette", show);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("fzx:palette", show); window.removeEventListener("keydown", onKey); };
  }, []);

  useEffect(() => {
    const lenis = (window as any).__lenis;
    if (open) {
      lenis?.stop();
      setQ(""); setSel(0); setWiki([]);
      requestAnimationFrame(() => inputRef.current?.focus());
      if (!lists) {
        Promise.all([api<PageCard[]>("/stories"), api<CaseCard[]>("/cases"), api<Person[]>("/people"), api<Book[]>("/books")])
          .then(([stories, cases, people, books]) => setLists({ stories, cases, people, books })).catch(() => {});
      }
    } else {
      lenis?.start();
      back.current?.focus?.();
    }
  }, [open]);

  const query = q.trim().toLowerCase();
  useEffect(() => {
    if (!query) { setWiki([]); return; }
    const t = window.setTimeout(() => {
      api<{ wiki: { page_id: string; type: string; title: string; summary: string }[] }>(`/search?q=${encodeURIComponent(query)}&limit=8`)
        .then((r) => setWiki(r.wiki.filter((w) => w.type !== "guide" || w.title.toLowerCase().includes(query))
          .map((w) => ({ id: w.page_id, type: w.type, title: w.title, summary: w.summary })))).catch(() => {});
    }, 220);
    return () => window.clearTimeout(t);
  }, [query]);

  const close = () => setOpen(false);
  const go = (to: string) => () => { close(); nav(to); };

  const groups = useMemo(() => {
    const items: Item[] = [
      ...NAV.map((n) => ({ key: `nav${n.to}`, group: "栏目", glyph: n.label[0], title: n.label, sub: NAV_SUB[n.to], hay: (n.label + NAV_SUB[n.to]).toLowerCase(), run: go(n.to) })),
      { key: "nav/search", group: "栏目", glyph: "检", title: "全站检索", sub: "知识页与原文段落", hay: "全站检索 搜索 检书", run: go("/search") },
      { key: "nav/guide", group: "栏目", glyph: "导", title: "网站导览", sub: "每个栏目怎么玩", hay: "网站导览 玩法 使用说明 帮助", run: go("/wiki/网站导览") },
    ];
    if (lists) {
      const card = (group: string, glyph: string, p: PageCard, sub?: string) => ({
        key: `${group}:${p.id}`, group, glyph, title: p.title, sub: sub ?? p.summary, run: go(routeFor(p.id, p.type)),
        hay: [p.title, ...(p.aliases || []), p.summary].join(" ").toLowerCase(),
      });
      items.push(...lists.stories.map((p) => card("故事", "事", p)));
      items.push(...lists.cases.map((p) => card("疑案", "证", p, p.question)));
      items.push(...lists.people.map((p) => card("人物", "人", p)));
      items.push(...lists.books.map((p) => card("书籍", "书", p)));
    }
    const known = new Set(items.map((i) => i.key.split(":")[1]).filter(Boolean));
    items.push(...wiki.filter((w) => !known.has(w.id)).map((w) => ({
      key: `wiki:${w.id}`, group: "知识页", glyph: "页", title: w.title, sub: w.summary, hay: query, run: go(routeFor(w.id, w.type)),
    })));
    let shown: Item[];
    if (!query) {
      const starters = new Set(lists?.stories.slice(0, 4).map((s) => `故事:${s.id}`));
      shown = items.filter((i) => i.group === "栏目" || starters.has(i.key));
    } else {
      shown = items.map((i) => [i, i.group === "知识页" ? 0.5 : score(i, query)] as const).filter(([, s]) => s > 0)
        .sort((a, b) => b[1] - a[1]).map(([i]) => i);
      shown.push(
        { key: "ask", group: "操作", glyph: "问", title: `问小傅：${q.trim()}`, sub: "基于知识库回答，并标注出处", hay: "", run: () => { close(); openChat(q.trim()); } },
        { key: "search", group: "操作", glyph: "检", title: `全站检索：${q.trim()}`, sub: "列出所有命中的知识页与原文段落", hay: "", run: go(`/search?q=${encodeURIComponent(q.trim())}`) },
      );
    }
    const by = new Map<string, Item[]>();
    for (const it of shown) {
      const g = by.get(it.group) || [];
      if (g.length < (query ? 6 : 9)) g.push(it);
      by.set(it.group, g);
    }
    return GROUP_ORDER.filter((g) => by.has(g)).map((g) => ({ name: g, items: by.get(g)! }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists, wiki, query, q]);
  const flat = groups.flatMap((g) => g.items);

  useEffect(() => { setSel(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => (s + 1) % Math.max(1, flat.length)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => (s - 1 + flat.length) % Math.max(1, flat.length)); }
    else if (e.key === "Enter") { e.preventDefault(); flat[sel]?.run(); }
  };

  let idx = -1;
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="pal-mask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onMouseDown={close}>
          <motion.div className="pal" role="dialog" aria-modal="true" aria-label="快速跳转" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}
            initial={{ opacity: 0, y: -14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}>
            <div className="pal-head">
              <span className="pal-seal" aria-hidden>检</span>
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="跳到栏目、故事、疑案、人物、书籍……或直接提问"
                role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={flat[sel] ? `pal-${flat[sel].key}` : undefined} />
              <kbd onClick={close}>Esc</kbd>
            </div>
            <div className="pal-list" id="pal-list" role="listbox" ref={listRef}>
              {groups.map((g) => (
                <div key={g.name} className="pal-group" role="group" aria-label={g.name}>
                  <div className="pal-gt">{g.name}</div>
                  {g.items.map((it) => {
                    idx += 1;
                    const i = idx;
                    return (
                      <button key={it.key} id={`pal-${it.key}`} data-idx={i} role="option" aria-selected={i === sel}
                        className={`pal-item ${i === sel ? "on" : ""}`} onMouseMove={() => i !== sel && setSel(i)} onClick={it.run}>
                        <span className="pal-ic">{it.glyph}</span>
                        <span className="pal-txt"><b><Mark text={it.title} q={query} /></b>{it.sub && <small>{it.sub}</small>}</span>
                        <span className="pal-enter" aria-hidden>↵</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {!lists && !query && <div className="pal-empty">正在载入目录……</div>}
            </div>
            <div className="pal-foot">
              <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span><span><kbd>Ctrl</kbd><kbd>K</kbd> 或 <kbd>/</kbd> 随时唤出</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
