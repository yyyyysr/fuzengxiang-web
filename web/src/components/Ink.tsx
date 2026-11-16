import { motion, type MotionValue, useTransform } from "framer-motion";

/** Procedural ink-wash mountain ridge as an SVG path. */
export function ridge(width: number, height: number, base: number, amp: number, seed: number, peaks = 7) {
  let s = seed;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const pts: [number, number][] = [];
  const step = width / (peaks * 6);
  for (let x = 0; x <= width + step; x += step) {
    const t = x / width;
    const y = base - amp * (0.55 * Math.sin(t * Math.PI * peaks * 0.5 + seed) ** 2 + 0.3 * Math.sin(t * Math.PI * peaks * 1.7 + seed * 2) ** 2 + 0.25 * rand());
    pts.push([x, y]);
  }
  let d = `M0 ${height} L0 ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    d += ` Q${x0.toFixed(1)} ${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}`;
  }
  return d + ` L${width} ${height} Z`;
}

type Layer = { base: number; amp: number; seed: number; color: string; opacity: number; peaks?: number; speed?: number };

export function InkMountains({ width = 1600, height = 600, layers, progress, className = "" }: {
  width?: number; height?: number; layers?: Layer[]; progress?: MotionValue<number>; className?: string;
}) {
  const ls: Layer[] = layers || [
    { base: 330, amp: 190, seed: 3, color: "#8c8577", opacity: 0.28, peaks: 5, speed: 0.15 },
    { base: 420, amp: 210, seed: 11, color: "#5a544a", opacity: 0.38, peaks: 6, speed: 0.3 },
    { base: 520, amp: 170, seed: 23, color: "#2c2823", opacity: 0.55, peaks: 8, speed: 0.55 },
  ];
  return (
    <svg className={`ink-mountains ${className}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <filter id="ink-blur"><feGaussianBlur stdDeviation="1.2" /></filter>
        {ls.map((l, i) => (
          <linearGradient key={i} id={`mg${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={l.color} stopOpacity={l.opacity} />
            <stop offset="0.65" stopColor={l.color} stopOpacity={l.opacity * 0.35} />
            <stop offset="1" stopColor={l.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {ls.map((l, i) => <MountainLayer key={i} l={l} i={i} width={width} height={height} progress={progress} />)}
    </svg>
  );
}

function MountainLayer({ l, i, width, height, progress }: { l: Layer; i: number; width: number; height: number; progress?: MotionValue<number> }) {
  const fallback = useTransform(() => 0);
  const x = useTransform(progress || fallback, [0, 1], [0, -(l.speed || 0.3) * 260]);
  return (
    <motion.path
      d={ridge(width + 400, height, l.base, l.amp, l.seed, l.peaks)}
      fill={`url(#mg${i})`}
      filter="url(#ink-blur)"
      style={{ x }}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.8, delay: 0.25 * i, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

/** Slowly drifting mist bands. */
export function Mist({ className = "" }: { className?: string }) {
  return (
    <div className={`mist ${className}`} aria-hidden>
      <span /><span /><span />
    </div>
  );
}

/** Ink blot that spreads when it enters the viewport. */
export function InkBlot({ size = 300, className = "", color = "#1d1a16", opacity = 0.08 }: { size?: number; className?: string; color?: string; opacity?: number }) {
  return (
    <motion.svg className={`ink-blot ${className}`} width={size} height={size} viewBox="0 0 200 200" aria-hidden
      initial={{ scale: 0.3, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }} transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1] }}>
      <defs><filter id="blot"><feTurbulence baseFrequency="0.035" numOctaves="3" seed="7" /><feDisplacementMap in="SourceGraphic" scale="34" /><feGaussianBlur stdDeviation="2" /></filter></defs>
      <circle cx="100" cy="100" r="62" fill={color} opacity={opacity} filter="url(#blot)" />
    </motion.svg>
  );
}
