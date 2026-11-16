import { useEffect, useRef } from "react";

export type Fx = "dust" | "petal" | "rain" | "snow" | "ember" | "leaf" | "mist" | "none";

type Scene = { img: HTMLImageElement; t0: number; seed: number; focus: number };
type Puff = { off: number; y: number; s: number; rot: number; vr: number; spr: number; a: number; rise: number };
type Trans = { start: number; fadeIn: boolean; dir: number; ox: number; oy: number; dur: number; veil: boolean };
type Veil = { start: number; dir: number; puffs: Puff[] };
type Particle = {
  type: Fx; x: number; y: number; vx: number; vy: number; s: number; a: number;
  rot: number; vr: number; ph: number; dying: boolean; fade: number;
};

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string) {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = src;
    });
    p.catch(() => imageCache.delete(src));
    imageCache.set(src, p);
  }
  return p;
}

export const preloadImages = (srcs: string[]) => srcs.forEach((s) => loadImage(s).catch(() => {}));

const prefersReduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const DENSITY: Record<Fx, number> = { dust: 70, petal: 26, rain: 170, snow: 90, ember: 46, leaf: 18, mist: 9, none: 0 };

function drawCover(ctx: CanvasRenderingContext2D, sc: Scene, w: number, h: number, now: number, still: boolean) {
  const img = sc.img;
  const t = still ? 0 : (now - sc.t0) / 1000;
  const e = 0.5 - 0.5 * Math.cos((t / 24) * Math.PI);
  const zoomIn = sc.seed > 0.35;
  const scale = 1.06 + 0.09 * (zoomIn ? e : 1 - e);
  const ir = img.naturalWidth / img.naturalHeight;
  let dw: number, dh: number;
  if (ir > w / h) { dh = h; dw = h * ir; } else { dw = w; dh = w / ir; }
  dw *= scale; dh *= scale;
  const panX = (sc.seed * 2 - 1) * 0.016 * e * w;
  const panY = (((sc.seed * 7.3) % 1) - 0.5) * 0.02 * e * h;
  const x = clamp((w - dw) * sc.focus + panX, w - dw, 0);
  const y = clamp((h - dh) / 2 + panY, h - dh, 0);
  ctx.drawImage(img, x, y, dw, dh);
}

const NW = 512, NH = 512;
let noise: Float32Array | null = null;

/** Tileable fractal value noise in [0,1], computed once and shared by every stage. */
function noiseField() {
  if (noise) return noise;
  const hash = (i: number, j: number) => {
    const s = Math.sin((i & 511) * 127.1 + (j & 511) * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vn = (x: number, y: number, period: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = xi % period, y0 = yi % period, x1 = (xi + 1) % period, y1 = (yi + 1) % period;
    const a = hash(x0, y0), b = hash(x1, y0), c = hash(x0, y1), d = hash(x1, y1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const out = new Float32Array(NW * NH);
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < NH; y++) {
    for (let x = 0; x < NW; x++) {
      let f = 0, amp = 0.5, cells = 6;
      for (let o = 0; o < 5; o++) { f += amp * vn((x / NW) * cells, (y / NH) * cells, cells); amp *= 0.5; cells *= 2; }
      out[y * NW + x] = f;
      if (f < lo) lo = f;
      if (f > hi) hi = f;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  noise = out;
  return out;
}

const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

let sprites: HTMLCanvasElement[] | null = null;

/** Billowing smoke puffs: noise-eroded discs with a little top-left lighting for volume. */
function smokeSprites() {
  if (sprites) return sprites;
  const nf = noiseField();
  const S = 192;
  sprites = [0, 1, 2, 3].map((v) => {
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d")!;
    const im = g.createImageData(S, S);
    const ox = (v * 173 + 41) & (NW - 1), oy = (v * 311 + 97) & (NH - 1);
    const at = (x: number, y: number) => nf[((((y * 1.7) | 0) + oy) & (NH - 1)) * NW + ((((x * 1.7) | 0) + ox) & (NW - 1))];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (x / (S - 1)) * 2 - 1, dy = (y / (S - 1)) * 2 - 1;
        const n = at(x, y);
        const a = smoothstep(0.04, 0.5, (1 - Math.hypot(dx, dy)) * 1.15 + (n - 0.5) * 0.95);
        const lit = clamp(0.64 + (n - at(x + 4, y + 4)) * 5.5 - dy * 0.16);
        const i = (y * S + x) * 4;
        im.data[i] = 168 + 84 * lit; im.data[i + 1] = 160 + 86 * lit; im.data[i + 2] = 150 + 88 * lit;
        im.data[i + 3] = a * 255;
      }
    }
    g.putImageData(im, 0, 0);
    return c;
  });
  return sprites;
}

function makePuffs(w: number, h: number): Puff[] {
  const r = Math.random;
  const n = Math.round(30 * clamp(w / h, 0.7, 2));
  return Array.from({ length: n }, () => {
    const off = Math.pow(r(), 1.4) * 0.8 - 0.08;
    return {
      off, y: r() * 1.3 - 0.15, s: 0.42 + r() * 0.5, rot: r() * 6.28, vr: (r() - 0.5) * 0.7,
      spr: (r() * 4) | 0, a: (0.62 + r() * 0.38) * (1 - Math.max(0, off) * 0.75), rise: 0.4 + r(),
    };
  });
}

function spawn(type: Fx, w: number, h: number, k: number, fresh: boolean): Particle {
  const r = Math.random;
  const p: Particle = { type, x: r() * w, y: r() * h, vx: 0, vy: 0, s: 1, a: 1, rot: r() * 6.28, vr: 0, ph: r() * 6.28, dying: false, fade: fresh ? 1 : 0 };
  switch (type) {
    case "dust": p.vx = (r() - 0.5) * 10 * k; p.vy = -(4 + r() * 10) * k; p.s = (0.6 + r() * 1.8) * k; p.a = 0.35 + r() * 0.5; break;
    case "petal": p.x = r() * w * 1.2 - w * 0.2; p.y = fresh ? r() * h : -20 * k; p.vx = (18 + r() * 36) * k; p.vy = (22 + r() * 40) * k; p.s = (2.6 + r() * 3.4) * k; p.vr = (r() - 0.5) * 2.4; p.a = 0.55 + r() * 0.35; break;
    case "rain": p.y = fresh ? r() * h : -40 * k; p.vx = -70 * k; p.vy = (720 + r() * 260) * k; p.s = (12 + r() * 18) * k; p.a = 0.12 + r() * 0.2; break;
    case "snow": p.y = fresh ? r() * h : -10 * k; p.vx = (r() - 0.5) * 14 * k; p.vy = (18 + r() * 34) * k; p.s = (0.9 + r() * 2.6) * k; p.a = 0.5 + r() * 0.45; break;
    case "ember": p.y = fresh ? r() * h : h + 10 * k; p.vx = (r() - 0.5) * 16 * k; p.vy = -(26 + r() * 60) * k; p.s = (0.8 + r() * 1.8) * k; p.a = 0.5 + r() * 0.5; break;
    case "leaf": p.x = r() * w * 1.2 - w * 0.1; p.y = fresh ? r() * h : -24 * k; p.vx = (r() - 0.3) * 30 * k; p.vy = (26 + r() * 30) * k; p.s = (5 + r() * 5) * k; p.vr = (r() - 0.5) * 2; p.a = 0.75 + r() * 0.25; break;
    case "mist": p.y = h * (0.35 + r() * 0.65); p.x = fresh ? r() * w : -w * 0.3; p.vx = (6 + r() * 12) * k; p.s = (w * (0.18 + r() * 0.22)); p.a = 0.05 + r() * 0.07; break;
  }
  return p;
}

function stepParticle(p: Particle, dt: number, w: number, h: number, t: number) {
  if (p.type === "snow" || p.type === "petal" || p.type === "leaf") p.x += Math.sin(t * 0.9 + p.ph) * 12 * dt;
  if (p.type === "ember") p.x += Math.sin(t * 2.2 + p.ph) * 18 * dt;
  p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
  p.fade = p.dying ? p.fade - dt * 0.9 : Math.min(1, p.fade + dt * 0.8);
  const m = p.type === "mist" ? p.s : 40;
  return p.fade > 0 && p.x > -m * 1.5 && p.x < w + m * 1.5 && p.y > -m && p.y < h + m;
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle, t: number) {
  const a = p.a * p.fade;
  if (a <= 0.004) return;
  switch (p.type) {
    case "dust": {
      const tw = 0.55 + 0.45 * Math.sin(t * 1.7 + p.ph);
      ctx.fillStyle = `rgba(255,222,160,${a * tw})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.283); ctx.fill();
      break;
    }
    case "petal":
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = `rgba(232,150,146,${a})`;
      ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.55 * (0.6 + 0.4 * Math.abs(Math.sin(t * 2 + p.ph))), 0, 0, 6.283); ctx.fill();
      ctx.restore();
      break;
    case "rain":
      ctx.strokeStyle = `rgba(214,222,230,${a})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * 0.02, p.y - p.s); ctx.stroke();
      break;
    case "snow":
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.283); ctx.fill();
      break;
    case "ember": {
      const fl = 0.6 + 0.4 * Math.sin(t * 9 + p.ph);
      ctx.fillStyle = `rgba(255,150,60,${a * 0.18 * fl})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 4, 0, 6.283); ctx.fill();
      ctx.fillStyle = `rgba(255,196,110,${a * fl})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.283); ctx.fill();
      break;
    }
    case "leaf":
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = `rgba(222,170,58,${a})`;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, p.s, -2.4, -0.74); ctx.closePath(); ctx.fill();
      ctx.restore();
      break;
    case "mist": {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s);
      g.addColorStop(0, `rgba(250,246,238,${a})`); g.addColorStop(1, "rgba(250,246,238,0)");
      ctx.fillStyle = g; ctx.fillRect(p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
      break;
    }
  }
}

const MASK_W = 320;

const VEIL_MS = 2600;

/**
 * Full-bleed canvas stage: slow camera drift on the current image, an ink-dissolve
 * wipe with a smoke front whenever `src` changes (from the right when dir > 0,
 * from the left when dir < 0), and an ambient particle layer chosen by `fx`.
 * When `veil` changes together with `src`, the wipe becomes a slower rolling wall
 * of smoke that hides the cut, for chapter-level breaks.
 */
export function InkStage({ src, fx = "dust", tone = "light", focus = 0.5, dir = 1, duration = 1500, veil, className = "" }: {
  src: string; fx?: Fx; tone?: "light" | "dark"; focus?: number; dir?: number; duration?: number;
  veil?: string | number; className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const S = useRef({
    cur: null as Scene | null,
    trans: null as Trans | null,
    snap: null as HTMLCanvasElement | null, off: null as HTMLCanvasElement | null,
    mask: null as HTMLCanvasElement | null, smoke: null as HTMLCanvasElement | null,
    maskData: null as ImageData | null, smokeData: null as ImageData | null,
    veilAnim: null as Veil | null,
    parts: [] as Particle[], fx, tone, dir, duration, veil, veilShown: veil, w: 0, h: 0, k: 1, visible: true, reduced: false,
  });
  Object.assign(S.current, { fx, tone, dir, duration, veil });

  useEffect(() => {
    const s = S.current;
    let alive = true;
    loadImage(src).then((img) => {
      if (!alive) return;
      const now = performance.now();
      const scene: Scene = { img, t0: now, seed: Math.random(), focus };
      const busy = s.veilAnim && now - s.veilAnim.start < VEIL_MS * 0.5;
      const veiled = s.veil !== s.veilShown && !s.reduced && !busy;
      s.veilShown = s.veil;
      const dir = s.dir >= 0 ? 1 : -1;
      const base = { start: now, dir, ox: (Math.random() * NW) | 0, oy: (Math.random() * NH) | 0, dur: veiled ? VEIL_MS : s.duration, veil: veiled };
      if (!s.cur) { s.cur = scene; s.trans = { ...base, fadeIn: true, veil: false }; return; }
      if (s.cur.img === img) { s.cur.focus = focus; return; }
      if (veiled) s.veilAnim = { start: now, dir, puffs: (smokeSprites(), makePuffs(s.w, s.h)) };
      const bg = bgRef.current;
      if (bg && s.snap) {
        const c = s.snap.getContext("2d")!;
        c.clearRect(0, 0, s.snap.width, s.snap.height);
        c.drawImage(bg, 0, 0, s.snap.width, s.snap.height);
      }
      s.cur = scene;
      s.trans = { ...base, fadeIn: false };
    }).catch(() => {});
    return () => { alive = false; };
  }, [src, focus]);

  useEffect(() => {
    const s = S.current;
    s.reduced = prefersReduced();
    const bg = bgRef.current!, fxc = fxRef.current!, wrap = wrapRef.current!;
    const ctx = bg.getContext("2d")!, fctx = fxc.getContext("2d")!;
    s.snap = document.createElement("canvas");
    s.off = document.createElement("canvas");
    s.mask = document.createElement("canvas");
    s.smoke = document.createElement("canvas");
    const idle = window.setTimeout(noiseField, 300);
    s.w = s.h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(wrap.clientWidth * dpr)), h = Math.max(1, Math.round(wrap.clientHeight * dpr));
      if (w === s.w && h === s.h) return;
      for (const c of [bg, fxc, s.off!, s.snap!]) { c.width = w; c.height = h; }
      const mh = Math.max(1, Math.round((MASK_W * h) / w));
      for (const c of [s.mask!, s.smoke!]) { c.width = MASK_W; c.height = mh; }
      s.maskData = s.mask!.getContext("2d")!.createImageData(MASK_W, mh);
      s.smokeData = s.smoke!.getContext("2d")!.createImageData(MASK_W, mh);
      s.w = w; s.h = h; s.k = dpr;
      s.parts = s.parts.filter((p) => p.x < w && p.y < h);
      if (s.trans && !s.trans.fadeIn) s.trans = null;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const io = new IntersectionObserver(([e]) => { s.visible = e.isIntersecting; }, { threshold: 0 });
    io.observe(wrap);

    // Pixels reveal where 0.6·x + 0.4·noise > th; for the veil, th trails the smoke
    // front by at least 0.27 of the width so the reveal never outruns the wall.
    const veilFront = (p: number) => 1.1 - 2.1 * smoothstep(0.1, 0.9, p);
    const thresh = (tr: Trans, p: number) => (tr.veil ? 0.6 * veilFront(p) + 0.56 : 0.96 - 0.94 * ease(p));

    const dissolve = (tr: Trans, p: number) => {
      const nf = noiseField();
      const md = s.maskData!.data, sd = s.smokeData!.data;
      const mw = s.mask!.width, mh = s.mask!.height;
      const th = thresh(tr, p);
      const tail = smoothstep(0.82, 1, p);
      const smokeA = Math.sin(Math.PI * p) * (1 - tail);
      const [r, g, b] = s.tone === "dark" ? [24, 20, 17] : [236, 228, 212];
      const drift = (p * 60) | 0;
      for (let y = 0; y < mh; y++) {
        const row = (((y * 1.15) | 0) + tr.oy) & (NH - 1);
        for (let x = 0; x < mw; x++) {
          const n = nf[row * NW + ((((x * 1.15) | 0) + tr.ox + drift) & (NW - 1))];
          const xn = x / (mw - 1);
          const v = (tr.dir > 0 ? xn : 1 - xn) * 0.6 + n * 0.4;
          const d = (v - th) / 0.085;
          const i = (y * mw + x) * 4;
          md[i + 3] = Math.max(tail, smoothstep(th - 0.025, th + 0.025, v)) * 255;
          sd[i] = r; sd[i + 1] = g; sd[i + 2] = b;
          sd[i + 3] = Math.exp(-d * d) * smokeA * (0.3 + 0.7 * n) * 215;
        }
      }
      s.mask!.getContext("2d")!.putImageData(s.maskData!, 0, 0);
      s.smoke!.getContext("2d")!.putImageData(s.smokeData!, 0, 0);
    };

    const drawVeil = (c: CanvasRenderingContext2D, v: Veil, p: number) => {
      const spr = smokeSprites();
      const { w, h } = s;
      const front = veilFront(p);
      const env = smoothstep(0, 0.12, p) * (1 - smoothstep(0.62, 1, p));
      const unit = Math.max(h, w * 0.55);
      for (const f of v.puffs) {
        const xn = front + f.off + 0.04 * Math.sin(p * 3 + f.rot);
        const x = (v.dir > 0 ? xn : 1 - xn) * w;
        const y = (f.y - f.rise * p * 0.08) * h;
        const sz = f.s * unit * (0.85 + 0.4 * p);
        const a = f.a * env;
        if (a < 0.01 || x < -sz || x > w + sz) continue;
        c.save();
        c.globalAlpha = a;
        c.translate(x, y);
        c.rotate(f.rot + f.vr * p);
        c.drawImage(spr[f.spr], -sz / 2, -sz / 2, sz, sz);
        c.restore();
      }
    };

    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!s.visible || document.hidden || !s.cur) return;
      const { w, h } = s;
      const still = s.reduced;
      const tr = s.trans;
      if (!tr) {
        drawCover(ctx, s.cur, w, h, now, still);
      } else {
        const p = clamp((now - tr.start) / (still ? 600 : tr.dur));
        if (tr.fadeIn || still) {
          if (tr.fadeIn) { ctx.fillStyle = s.tone === "dark" ? "#14110e" : "#e9e0cf"; ctx.fillRect(0, 0, w, h); }
          else ctx.drawImage(s.snap!, 0, 0);
          ctx.globalAlpha = ease(p);
          drawCover(ctx, s.cur, w, h, now, still);
          ctx.globalAlpha = 1;
        } else {
          dissolve(tr, p);
          const off = s.off!, octx = off.getContext("2d")!;
          octx.globalCompositeOperation = "source-over";
          octx.clearRect(0, 0, w, h);
          drawCover(octx, s.cur, w, h, now, still);
          octx.globalCompositeOperation = "destination-in";
          octx.drawImage(s.mask!, 0, 0, w, h);
          octx.globalCompositeOperation = "source-over";
          ctx.drawImage(s.snap!, 0, 0);
          ctx.drawImage(off, 0, 0);
          ctx.drawImage(s.smoke!, 0, 0, w, h);
        }
        if (p >= 1) s.trans = null;
      }

      fctx.clearRect(0, 0, w, h);
      if (still) return;
      const t = now / 1000;
      const want = Math.round(DENSITY[s.fx] * Math.min(2, (w * h) / (1600 * 900 * s.k * s.k)));
      let have = 0;
      for (const p of s.parts) {
        if (p.type !== s.fx) p.dying = true;
        else if (!p.dying) have++;
      }
      const fresh = s.parts.length === 0;
      for (let i = 0; i < Math.min(want - have, fresh ? want : 3); i++) s.parts.push(spawn(s.fx, w, h, s.k, fresh));
      s.parts = s.parts.filter((p) => stepParticle(p, dt, w, h, t));
      for (const p of s.parts) drawParticle(fctx, p, t);
      const v = s.veilAnim;
      if (v) {
        const vp = (now - v.start) / VEIL_MS;
        if (vp >= 1) s.veilAnim = null;
        else drawVeil(fctx, v, vp);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(idle); ro.disconnect(); io.disconnect(); };
  }, []);

  return (
    <div ref={wrapRef} className={`ink-stage ${className}`} aria-hidden>
      <canvas ref={bgRef} />
      <canvas ref={fxRef} />
    </div>
  );
}

