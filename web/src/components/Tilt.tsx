import { useRef, type PointerEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";

/** Mouse-only 3D tilt + spotlight; writes --rx/--ry/--mx/--my on the element. */
export function useTilt<T extends HTMLElement>(max = 7) {
  const ref = useRef<T>(null);
  const onPointerMove = (e: PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - y) * max}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * max}deg`);
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
  };
  const onPointerLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };
  return { ref, onPointerMove, onPointerLeave };
}

export function TiltLink({ to, className = "", max, children }: { to: string; className?: string; max?: number; children: ReactNode }) {
  const t = useTilt<HTMLAnchorElement>(max);
  return (
    <Link to={to} className={`tilt ${className}`} {...t}>
      {children}
      <span className="tilt-glare" aria-hidden />
    </Link>
  );
}
