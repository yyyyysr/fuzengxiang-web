import { useEffect, useRef } from "react";

type Bloom = { x: number; y: number; t0: number; r: number; a: number; dx: number; dy: number; spark: boolean };
const LIFE = 2600;

/** Pointer movement over the parent stirs pale mist blooms and a few gold flecks (fine pointers only). */
export function PointerMist() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const host = cv.parentElement!;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = cv.getContext("2d")!;
    const blooms: Bloom[] = [];
    let k = 1, raf = 0, lx = -999, ly = -999;
    const resize = () => {
      k = Math.min(window.devicePixelRatio || 1, 1.5);
      cv.width = Math.round(host.clientWidth * k);
      cv.height = Math.round(host.clientHeight * k);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const loop = (now: number) => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (let i = blooms.length - 1; i >= 0; i--) {
        const b = blooms[i];
        const age = (now - b.t0) / LIFE;
        if (age >= 1) { blooms.splice(i, 1); continue; }
        const x = (b.x + b.dx * age * 60) * k, y = (b.y + b.dy * age * 60) * k;
        if (b.spark) {
          ctx.fillStyle = `rgba(255, 214, 150, ${b.a * (1 - age)})`;
          ctx.beginPath(); ctx.arc(x, y, b.r * k, 0, 6.283); ctx.fill();
          continue;
        }
        const r = b.r * k * (0.25 + 0.75 * (1 - Math.pow(1 - age, 3)));
        const a = b.a * Math.pow(1 - age, 1.6);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(243, 236, 223, ${a})`);
        g.addColorStop(0.55, `rgba(243, 236, 223, ${a * 0.45})`);
        g.addColorStop(1, "rgba(243, 236, 223, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      raf = blooms.length ? requestAnimationFrame(loop) : 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (Math.hypot(x - lx, y - ly) < 28) return;
      lx = x; ly = y;
      const now = performance.now();
      blooms.push({ x, y, t0: now, r: 46 + Math.random() * 70, a: 0.07 + Math.random() * 0.06, dx: (Math.random() - 0.5) * 0.6, dy: -0.25 - Math.random() * 0.3, spark: false });
      if (Math.random() < 0.45) {
        blooms.push({ x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 20, t0: now, r: 0.8 + Math.random() * 1.4, a: 0.9, dx: (Math.random() - 0.5) * 0.8, dy: -0.6 - Math.random() * 0.8, spark: true });
      }
      if (blooms.length > 90) blooms.splice(0, blooms.length - 90);
      if (!raf) raf = requestAnimationFrame(loop);
    };
    host.addEventListener("pointermove", onMove, { passive: true });
    return () => { cancelAnimationFrame(raf); ro.disconnect(); host.removeEventListener("pointermove", onMove); };
  }, []);
  return <canvas ref={ref} className="pointer-mist" aria-hidden />;
}
