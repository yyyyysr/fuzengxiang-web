import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

type Run = { k: number; x: number; y: number; s: number; rot: number };
const BLOB = 240; // px; the solid ink core reaches 36% of this at scale 1
const DROPS = [[18, 0.84, 7], [74, 0.78, 4], [131, 0.88, 6], [196, 0.8, 3.5], [248, 0.86, 6], [305, 0.76, 3]];

/** Route change: a drop of ink lands where you clicked, bleeds over the page, then dries away to reveal the next one. */
export function InkVeil() {
  const { pathname } = useLocation();
  const prev = useRef(pathname);
  const tap = useRef<{ x: number; y: number; t: number } | null>(null);
  const [run, setRun] = useState<Run | null>(null);

  useEffect(() => {
    const on = (e: PointerEvent) => { tap.current = { x: e.clientX, y: e.clientY, t: performance.now() }; };
    window.addEventListener("pointerdown", on, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", on, { capture: true });
  }, []);

  useEffect(() => {
    if (prev.current === pathname) return;
    prev.current = pathname;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const w = window.innerWidth, h = window.innerHeight;
    const t = tap.current && performance.now() - tap.current.t < 1500 ? tap.current : null;
    const x = t ? t.x : w / 2, y = t ? t.y : h / 2;
    const far = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
    setRun({ k: performance.now(), x, y, s: (far / (BLOB * 0.36)) * 1.06, rot: Math.random() * 360 });
  }, [pathname]);

  return (
    <AnimatePresence>
      {run && (
        <motion.div key={run.k} className="ink-veil" aria-hidden initial={{ opacity: 1 }} animate={{ opacity: [1, 1, 0] }}
          transition={{ duration: 1.2, times: [0, 0.6, 1], ease: ["linear", [0.2, 0.7, 0.3, 1]] }} onAnimationComplete={() => setRun(null)}>
          <motion.div className="ink-veil-wash" style={{ left: run.x, top: run.y, width: BLOB, height: BLOB, rotate: run.rot }}
            initial={{ scale: 0 }} animate={{ scale: run.s * 1.18 }} transition={{ duration: 0.5, ease: [0.3, 0.6, 0.2, 1] }}>
            {DROPS.map(([a, d, r], i) => (
              <i key={i} style={{ width: r, height: r, left: `${50 + Math.cos((a * Math.PI) / 180) * d * 50}%`, top: `${50 + Math.sin((a * Math.PI) / 180) * d * 50}%` }} />
            ))}
          </motion.div>
          <motion.div className="ink-veil-core" style={{ left: run.x, top: run.y, width: BLOB, height: BLOB, rotate: run.rot + 40 }}
            initial={{ scale: 0 }} animate={{ scale: run.s }} transition={{ duration: 0.46, delay: 0.03, ease: [0.5, 0, 0.25, 1] }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
