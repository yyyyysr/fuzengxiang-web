export type Relation = { target: string; type: string; label: string; date?: string | number; evidence?: string[] };

export type PageCard = { id: string; type: string; title: string; summary: string; aliases?: string[]; status?: string; date?: string };

export type WikiPage = PageCard & {
  body: string;
  frontmatter: Record<string, any>;
  sections: Record<string, string>;
  links: string[];
  source_refs: string[];
  link_titles: Record<string, string>;
  backlink_cards: PageCard[];
  mentioned_docs: { doc_id: string; count: number; title: string }[];
};

export type TimelineItem = {
  id: string; kind: "event" | "story"; title: string; date: string; date_end: string; date_precision: string;
  themes: string[]; summary: string; evidence_level: string; story: string; disputed: boolean;
  participants: string[]; books: string[]; places: string[];
};

export type StoryCard = PageCard & { rank: number; themes: string[]; evidence_level: string; date_end: string; one_liner: string; images: string[] };
export type Act = { label: string; text: string; source: string; images?: string[] };
export type Story = WikiPage & { rank: number; one_liner: string; acts: Act[]; mode: "acts" | "symbols"; operation: string; pending: string; evidence_level: string; images: ImageItem[] };

export type CaseCard = PageCard & { rank: number; question: string; hypotheses: string[]; case_status: string };
export type Case = WikiPage & {
  question: string; hypotheses: string[]; case_status: string; card_headers: string[]; cards: string[][];
  hypothesis_text: string; hints: string; conclusion: string; why: string; pending: string;
};

export type Book = PageCard & { work: string; edition: string; current_holder: string; relations: Relation[]; relation_types: string[]; images: string[] };
export type Person = PageCard & { birth?: number; death?: number; roles: string[]; relations: Relation[]; relation_types: string[] };
export type NetNode = { id: string; type: string; title: string; summary: string };
export type NetEdge = { source: string; target: string; type: string; label?: string; date?: string; evidence?: string[]; kind: string };

export type ImageItem = {
  id: string; title: string; kind: string; raw_path: string; parent_id: string | null; origin: string;
  file: string; thumb: string; width: number; height: number; seal_text?: string; seal_color?: string; seal_style?: string;
};

export type Block = { bid: string; type: string; text: string; page: number | null; page_end?: number; level?: number; asset?: string };
export type Doc = {
  doc_id: string; title: string; subtitle: string; authors: string[]; origin: string; citation: string; abstract: string;
  keywords: string[]; year: string; journal: string; page_range: string; raw_path: string; pages: number; canonical: boolean;
  alternates: string[]; quality: Record<string, any>; blocks: Block[];
};

export type ChatSource = {
  n: number; kind: "wiki" | "chunk"; id: string; title: string; type?: string; summary?: string; bid?: string | null;
  page?: number | null; authors?: string[]; citation?: string; heading?: string; snippet: string;
};

export const kbAsset = (p: string) => `/kb-assets/${p.replace(/^assets\//, "")}`;

const cache = new Map<string, Promise<any>>();

export function api<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(`/api${path}`).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `请求失败 ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path)!;
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`请求失败 ${r.status}`);
  return r.json();
}

export type ChatHandlers = {
  onStatus?: (d: { emotion: string; stage: string }) => void;
  onSources?: (d: { sources: ChatSource[]; entities: string[]; terms: string[]; dense: boolean }) => void;
  onDelta?: (text: string) => void;
  onDone?: (d: { emotion: string; mode: string }) => void;
};

export async function streamChat(question: string, history: { role: string; content: string }[], context: string | null, h: ChatHandlers, signal?: AbortSignal) {
  const r = await fetch("/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ question, history, context }),
  });
  if (!r.ok || !r.body) throw new Error(`问答服务不可用（${r.status}）`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const ev = /event: (.+)/.exec(raw)?.[1];
      const dataLine = /data: (.+)/s.exec(raw)?.[1];
      if (!ev || !dataLine) continue;
      const data = JSON.parse(dataLine);
      if (ev === "status") h.onStatus?.(data);
      else if (ev === "sources") h.onSources?.(data);
      else if (ev === "delta") h.onDelta?.(data.text);
      else if (ev === "done") h.onDone?.(data);
    }
  }
}

/** Parse [[target#^bid|label]] style links. */
export const WIKILINK = /\[\[([^\]|#\\]+)(?:#(\^?[^\]|\\]+))?(?:\\?\|([^\]]+))?\]\]/g;
export const DOC_ID = /^(cnki|wanfang|vip|book|web|img)-\d{4}$/;

export function stripLinks(s: string) {
  return (s || "").replace(WIKILINK, (_m, t, _a, label) => label || t);
}

export const TYPE_LABEL: Record<string, string> = {
  person: "人物", book: "书籍", work: "著述·项目", place: "地点", org: "机构", event: "事件", concept: "概念",
  story: "故事", case: "疑案", synthesis: "综述", source: "文献", meta: "说明",
};

export function routeFor(id: string, type?: string) {
  if (DOC_ID.test(id)) return `/doc/${id}`;
  if (type === "story") return `/stories/${encodeURIComponent(id)}`;
  if (type === "case") return `/cases/${encodeURIComponent(id)}`;
  return `/wiki/${encodeURIComponent(id)}`;
}
