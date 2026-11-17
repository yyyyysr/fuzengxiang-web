import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";
import { DOC_ID, WIKILINK, routeFor } from "../lib/api";
import { useSource } from "../lib/store";

function textOf(node: ReactNode): string {
  return Children.toArray(node).map((c) => (typeof c === "string" || typeof c === "number" ? String(c)
    : isValidElement<{ children?: ReactNode }>(c) ? textOf(c.props.children) : "")).join("");
}

export const sectionId = (heading: string) => `sec-${heading.trim()}`;

/** Render wiki markdown: [[page]] -> route, [[doc#^bid|label]] -> opens the source drawer. */
export function Markdown({ text, titles = {}, className = "" }: { text: string; titles?: Record<string, string>; className?: string }) {
  const src = useSource();
  const md = (text || "")
    .replace(/<small>(.*?)<\/small>/g, "$1")
    .replace(WIKILINK, (_m, target: string, anchor: string | undefined, label: string | undefined) => {
      const t = target.trim();
      const shown = label || titles[t] || t;
      return `[${shown.replace(/[[\]]/g, "")}](kb:${encodeURIComponent(t)}${anchor ? "#" + anchor.replace("^", "") : ""})`;
    });
  return (
    <div className={`md ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(u) => u}
        components={{
          h2({ children }) {
            return <h2 id={sectionId(textOf(children))}>{children}</h2>;
          },
          a({ href = "", children }) {
            if (href.startsWith("kb:")) {
              const [rawId, bid] = href.slice(3).split("#");
              const id = decodeURIComponent(rawId);
              if (DOC_ID.test(id)) {
                return (
                  <button type="button" className="src-link" onClick={() => src.open(id, bid)} title="查看出处原文">
                    {children}
                  </button>
                );
              }
              return <Link className="link-zhu" to={routeFor(id)}>{children}</Link>;
            }
            return <a className="link-zhu" href={href} target="_blank" rel="noreferrer">{children}</a>;
          },
        }}
      >
        {md}
      </ReactMarkdown>
    </div>
  );
}
