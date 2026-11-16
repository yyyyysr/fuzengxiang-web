import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const PRELOAD = ["/xiaofu/idle.webp", "/xiaofu/happy.webp", "/xiaofu/thinking.webp", "/kb-assets/images/thumbs/img-0069.jpg", "/kb-assets/images/thumbs/img-0009.jpg"];

/** Opening screen with a real percentage (preloads key images + data), like the CGTN piece. */
export function Loader({ onDone }: { onDone: () => void }) {
  const [pct, setPct] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let loaded = 0;
    const tasks: Promise<unknown>[] = [
      ...PRELOAD.map((src) => new Promise((res) => { const im = new Image(); im.onload = im.onerror = res; im.src = src; })),
      fetch("/api/overview").catch(() => null),
      fetch("/api/timeline").catch(() => null),
      document.fonts?.ready ?? Promise.resolve(),
    ];
    const total = tasks.length;
    let shown = 0;
    let target = 0;
    tasks.forEach((t) => t.then(() => { loaded += 1; target = Math.round((loaded / total) * 100); }));
    const minTime = Date.now() + 1600;
    const tick = window.setInterval(() => {
      shown = Math.min(target, shown + Math.max(1, Math.round((target - shown) / 6)));
      setPct(shown);
      if (shown >= 100 && Date.now() > minTime) {
        window.clearInterval(tick);
        setLeaving(true);
        window.setTimeout(onDone, 900);
      }
    }, 40);
    const safety = window.setTimeout(() => { target = 100; }, 6000);
    return () => { window.clearInterval(tick); window.clearTimeout(safety); };
  }, [onDone]);

  return (
    <AnimatePresence>
      {!leaving && (
        <motion.div className="loader" exit={{ clipPath: "circle(0% at 50% 50%)", opacity: 0 }} transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1] }}>
          <motion.div className="loader-seal" initial={{ scale: 0.6, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -6 }} transition={{ type: "spring", stiffness: 200, damping: 14 }}>
            藏园
          </motion.div>
          <div className="loader-title brush">书魂永不散藏园</div>
          <div className="loader-bar"><motion.span style={{ width: `${pct}%` }} /></div>
          <div className="loader-pct">{pct}%</div>
          <p className="loader-tip">展卷之前，先磨一池墨</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
