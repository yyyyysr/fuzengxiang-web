import { animate, motion, useInView, type HTMLMotionProps } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

/** "← 返回" goes back to wherever the reader came from inside the site; on a fresh tab it opens `fallback`. */
export function BackLink({ fallback, label, className = "back-link" }: { fallback: string; label: string; className?: string }) {
  const nav = useNavigate();
  const canBack = (window.history.state?.idx ?? 0) > 0;
  return (
    <a href={fallback} className={className} onClick={(e) => { e.preventDefault(); if (canBack) nav(-1); else nav(fallback); }}>
      ← {canBack ? "返回" : label}
    </a>
  );
}

/** Counts up from 0 the first time it scrolls into view. */
export function CountUp({ to, duration = 1.6, className = "" }: { to: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, margin: "-40px" });
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!seen || !to) return;
    const c = animate(0, to, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [seen, to, duration]);
  return <span ref={ref} className={className}><span className="sr-only">{to}</span><span aria-hidden>{v}</span></span>;
}

const SPLIT_FROM = { opacity: 0, y: "0.45em", filter: "blur(10px)", rotate: -4 };
const SPLIT_TO = { opacity: 1, y: "0em", filter: "blur(0px)", rotate: 0 };

/** Characters rise out of an ink blur one by one, on mount (or when scrolled into view with `inView`). */
export function SplitText({ text, delay = 0, stagger = 0.055, inView = false, play = true, className = "" }: {
  text: string; delay?: number; stagger?: number; inView?: boolean; play?: boolean; className?: string;
}) {
  const trigger = inView ? { whileInView: SPLIT_TO, viewport: { once: true, margin: "-40px" } } : { animate: play ? SPLIT_TO : SPLIT_FROM };
  return (
    <span className={`split ${className}`}>
      <span className="sr-only">{text}</span>
      {[...text].map((c, i) => (
        <motion.span key={i} aria-hidden className="split-ch" initial={SPLIT_FROM} {...trigger}
          transition={{ delay: delay + i * stagger, duration: 0.85, ease: [0.22, 1, 0.36, 1] }}>{c === " " ? "\u00a0" : c}</motion.span>
      ))}
    </span>
  );
}

export function Reveal({ children, delay = 0, y = 28, className = "", ...rest }: { children: ReactNode; delay?: number; y?: number; className?: string } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function PageHeader({ eyebrow, title, lead, side }: { eyebrow: string; title: string; lead?: ReactNode; side?: ReactNode }) {
  return (
    <header className="page-header container">
      <div>
        <motion.span className="eyebrow" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7 }}>{eyebrow}</motion.span>
        <h1 className="page-title"><SplitText text={title} delay={0.12} stagger={title.length > 10 ? 0.04 : 0.07} /></h1>
        {lead && <motion.div className="page-lead" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.9 }}>{lead}</motion.div>}
      </div>
      {side && <motion.div className="page-header-side" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.9 }}>{side}</motion.div>}
    </header>
  );
}

export function CloudDivider({ width = 220 }: { width?: number }) {
  return (
    <svg className="cloud-divider" width={width} height="28" viewBox="0 0 220 28" aria-hidden>
      <path d="M2 14h60c6 0 8-10 16-10s10 8 14 8 6-6 12-6 8 8 16 8h98" fill="none" stroke="#a8322a" strokeWidth="1.2" />
      <circle cx="110" cy="14" r="3" fill="#a8322a" />
      <path d="M2 18h60M158 18h60" stroke="#a8322a" strokeWidth=".6" opacity=".6" />
    </svg>
  );
}

export function Stamp({ text, size = 64, rotate = -6 }: { text: string; size?: number; rotate?: number }) {
  // Seal script reads top-to-bottom, right column first.
  const chars = text.split("");
  const cols = chars.length > 2 ? 2 : 1;
  const rows = Math.ceil(chars.length / cols);
  return (
    <motion.div
      className="stamp" style={{ width: size, height: size, rotate }}
      initial={{ scale: 2.2, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }}
      transition={{ type: "spring", stiffness: 380, damping: 16, delay: 0.2 }}
    >
      <span style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, fontSize: size / (cols === 2 ? 2.9 : 2) }}>
        {chars.map((c, i) => {
          const col = cols - Math.floor(i / rows);
          const lastAlone = cols === 2 && chars.length % 2 === 1 && col === 1;
          return <i key={i} style={{ gridColumn: col, gridRow: lastAlone ? `1 / span ${rows}` : (i % rows) + 1, fontSize: lastAlone ? "1.5em" : undefined, alignSelf: "center" }}>{c}</i>;
        })}
      </span>
    </motion.div>
  );
}

export function Loading({ h = 240 }: { h?: number }) {
  return <div className="skeleton" style={{ height: h }} />;
}

export function ErrorNote({ msg }: { msg: string }) {
  return <div className="empty">数据加载失败：{msg}<br /><span className="small">请确认后端服务已启动（python server/app.py）。</span></div>;
}
