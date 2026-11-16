/** Split a markdown table into rows of cells (keeps [[a|b]] links intact). */
export function parseTable(md: string): string[][] {
  const lines = (md || "").split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 3) return [];
  const cells = (line: string) => {
    const s = line.trim().replace(/^\||\|$/g, "");
    const out: string[] = [];
    let cur = "", depth = 0;
    for (let i = 0; i < s.length; i++) {
      if (s.startsWith("[[", i)) depth++;
      if (s.startsWith("]]", i)) depth = Math.max(0, depth - 1);
      if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; continue; }
      if (s[i] === "|" && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += s[i];
    }
    out.push(cur.trim());
    return out;
  };
  return [cells(lines[0]), ...lines.slice(2).map(cells)];
}

export function bullets(md: string): string[] {
  return (md || "").split("\n").filter((l) => /^\s*[-*]\s+/.test(l)).map((l) => l.replace(/^\s*[-*]\s+/, ""));
}

export function yearOf(d: string) {
  return (d || "").slice(0, 4);
}
