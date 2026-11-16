import { useEffect, useRef } from "react";

const HOT = "a, button, [role='button'], [role='option'], [role='tab'], summary, label, select, .tilt";
const MAGNET = ".btn, .scine-play, .pre-cta";

/** Ink halo that trails the pointer, swells over clickable things and splashes on click (fine pointers only). */
export function InkCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduced.matches) return;
    const ring = ringRef.current!, layer = layerRef.current!;
    let x = -100, y = -100, rx = -100, ry = -100, raf = 0, shown = false;
    let magnet: HTMLElement | null = null;

    const tick = () => {
      rx += (x - rx) * 0.2;
      ry += (y - ry) * 0.2;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      raf = Math.abs(x - rx) + Math.abs(y - ry) > 0.3 ? requestAnimationFrame(tick) : 0;
    };
    const release = () => {
      if (magnet) magnet.style.translate = "";
      magnet = null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX; y = e.clientY;
      if (!shown) { shown = true; rx = x; ry = y; ring.classList.add("on"); }
      if (!raf) raf = requestAnimationFrame(tick);
      const t = e.target as Element | null;
      const typing = !!t?.closest?.("input, textarea, [contenteditable]");
      ring.classList.toggle("hot", !typing && !!t?.closest?.(HOT));
      ring.classList.toggle("text", typing);
      const m = t?.closest?.(MAGNET) as HTMLElement | null;
      if (m !== magnet) release();
      if (m) {
        const r = m.getBoundingClientRect();
        magnet = m;
        m.style.translate = `${((x - r.left) / r.width - 0.5) * 8}px ${((y - r.top) / r.height - 0.5) * 6}px`;
      }
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      ring.classList.add("down");
      const s = document.createElement("i");
      s.className = "cur-splash";
      s.style.left = `${e.clientX}px`;
      s.style.top = `${e.clientY}px`;
      s.style.setProperty("--rot", `${Math.random() * 360}deg`);
      layer.appendChild(s);
      window.setTimeout(() => s.remove(), 700);
    };
    const onUp = () => ring.classList.remove("down");
    const onLeave = () => { shown = false; ring.classList.remove("on"); release(); };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      release();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="ink-cursor" aria-hidden>
      <div className="cur-ring" ref={ringRef}><span /></div>
      <div ref={layerRef} />
    </div>
  );
}
