import type { Fx } from "../components/InkStage";

export const artUrl = (name: string, thumb = false) => `/story/${thumb ? "thumb/" : ""}${name}.webp`;

export type ActArt = { img: string; fx: Fx; focus?: number; tone?: "light" | "dark" };
type StoryArt = { slug: string; acts: ActArt[]; poster: string };

const a = (img: string, fx: Fx, focus = 0.5, tone: "light" | "dark" = "light"): ActArt => ({ img, fx, focus, tone });

export const STORY_ART: Record<string, StoryArt> = {
  扬子法言合璧: { slug: "yangzi", poster: "story-yangzi-3", acts: [a("story-yangzi-1", "dust"), a("story-yangzi-2", "dust"), a("story-yangzi-3", "dust"), a("story-yangzi-4", "dust")] },
  乐府诗集避火: { slug: "yuefu", poster: "story-yuefu-3", acts: [a("story-yuefu-1", "dust"), a("story-yuefu-2", "dust"), a("story-yuefu-3", "ember", 0.5, "dark"), a("story-yuefu-4", "dust")] },
  水灾运书: { slug: "flood", poster: "story-flood-2", acts: [a("story-flood-1", "rain"), a("story-flood-2", "rain", 0.35), a("story-flood-3", "rain"), a("story-flood-4", "mist")] },
  东坡和陶诗失窃: { slug: "theft", poster: "story-theft-2", acts: [a("story-theft-1", "dust"), a("story-theft-2", "leaf", 0.38), a("story-theft-3", "dust"), a("story-theft-4", "dust", 0.55)] },
  海源阁遗书散出: { slug: "haiyuan", poster: "story-haiyuan-2", acts: [a("story-haiyuan-1", "snow"), a("story-haiyuan-2", "ember", 0.55, "dark"), a("story-haiyuan-3", "dust"), a("story-haiyuan-4", "dust", 0.62)] },
  永乐大典六册: { slug: "yongle", poster: "story-yongle-2", acts: [a("story-yongle-1", "dust", 0.7), a("story-yongle-2", "dust", 0.42), a("story-yongle-3", "snow", 0.42), a("story-yongle-4", "dust", 0.3)] },
  百衲本史记选底本: { slug: "bainaben", poster: "story-bainaben-4", acts: [a("story-bainaben-1", "dust", 0.55), a("story-bainaben-2", "dust", 0.62, "dark"), a("story-bainaben-3", "dust"), a("story-bainaben-4", "dust")] },
  道藏影印订购: { slug: "daozang", poster: "story-daozang-1", acts: [a("story-daozang-1", "snow", 0.35), a("story-daozang-2", "dust", 0.45), a("story-daozang-3", "dust"), a("story-daozang-4", "dust")] },
  校一页通典: { slug: "tongdian", poster: "story-tongdian-1", acts: [a("story-tongdian-1", "ember", 0.42, "dark")] },
  藏园群书入公藏: { slug: "gongcang", poster: "story-gongcang-2", acts: [a("story-gongcang-1", "leaf", 0.45), a("story-gongcang-2", "leaf", 0.5), a("story-gongcang-3", "snow"), a("story-gongcang-4", "mist", 0.7), a("story-gongcang-5", "dust")] },
};

export function actArt(storyId: string, i: number): ActArt | null {
  const s = STORY_ART[storyId];
  if (!s) return null;
  return s.acts[Math.min(i, s.acts.length - 1)];
}

export type Chapter = {
  no: number; name: string; range: string; lead: string; img: string; fx: Fx; focus: number; tone: "light" | "dark";
  match: (year: number, themes: string[]) => boolean;
};

export const LIFE_CHAPTERS: Chapter[] = [
  { no: 1, name: "蜀中少年", range: "1872 — 1898", lead: "生于四川江安，由科举入仕。", img: "chapter-1", fx: "mist", focus: 0.7, tone: "light", match: (y) => y <= 1898 },
  { no: 2, name: "兴学育才", range: "1905 — 1911", lead: "在天津创办女学，主持直隶学务。", img: "chapter-2", fx: "petal", focus: 0.7, tone: "light", match: (y, th) => y <= 1911 && !(y === 1911 && th.includes("藏书")) },
  { no: 3, name: "双鉴名楼", range: "1911 — 1919", lead: "得两部宋本《资治通鉴》，书斋名“双鉴楼”；任教育总长，又辞去。", img: "chapter-3", fx: "dust", focus: 0.72, tone: "dark", match: (y) => y <= 1919 },
  { no: 4, name: "书林京华", range: "1923 — 1925", lead: "祭书、影印、护书，与图书馆往来日深。", img: "chapter-4", fx: "snow", focus: 0.7, tone: "light", match: (y) => y <= 1926 },
  { no: 5, name: "海内访书", range: "1927 — 1934", lead: "南北访书、东渡日本，为百衲本寻访底本。", img: "chapter-5", fx: "mist", focus: 0.75, tone: "light", match: (y) => y <= 1940 },
  { no: 6, name: "化身千百", range: "1941 — 1949", lead: "校书至病中，藏书最终归于公藏。", img: "chapter-6", fx: "leaf", focus: 0.66, tone: "light", match: () => true },
];

export const STORY_EVENT_ART: Record<string, ActArt> = {
  水灾运书: a("story-flood-4", "rain"),
  道藏影印订购: a("story-daozang-3", "dust"),
  东坡和陶诗失窃: a("story-theft-2", "leaf", 0.38),
  海源阁遗书散出: a("story-haiyuan-1", "snow"),
  百衲本史记选底本: a("story-bainaben-1", "dust", 0.55),
  扬子法言合璧: a("story-yangzi-2", "dust"),
  乐府诗集避火: a("story-yuefu-3", "ember", 0.5, "dark"),
  藏园群书入公藏: a("story-gongcang-1", "leaf", 0.45),
};

export const CN_CAPS = "零壹贰叁肆伍陆柒捌玖拾";
const CN_DIGITS = "〇一二三四五六七八九";

export function cnNumber(n: number) {
  if (n === 1) return "元";
  if (n < 10) return CN_DIGITS[n];
  if (n < 20) return "十" + (n % 10 ? CN_DIGITS[n % 10] : "");
  return CN_DIGITS[Math.floor(n / 10)] + "十" + (n % 10 ? CN_DIGITS[n % 10] : "");
}

export function ganzhi(y: number) {
  return "甲乙丙丁戊己庚辛壬癸"[(y - 4) % 10] + "子丑寅卯辰巳午未申酉戌亥"[(y - 4) % 12];
}

const ERAS: [number, string][] = [[1912, "民国"], [1909, "宣统"], [1875, "光绪"], [1862, "同治"]];

/** 1916 → "民国五年"; dates after 1949-10-01 have no reign title. */
export function reignTitle(date: string) {
  const y = parseInt(date.slice(0, 4), 10);
  const m = parseInt(date.slice(5, 7), 10) || 0;
  if (!y || y > 1949 || (y === 1949 && m >= 10)) return "";
  const era = ERAS.find(([start]) => y >= start);
  return era ? `${era[1]}${cnNumber(y - era[0] + 1)}年` : "";
}

export function yearLabel(date: string) {
  const y = parseInt(date.slice(0, 4), 10);
  if (!y) return date;
  const r = reignTitle(date);
  return `${y}年（${r ? `${r} · ` : ""}${ganzhi(y)}）`;
}
